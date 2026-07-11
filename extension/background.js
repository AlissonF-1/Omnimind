// Cria a opção no menu de contexto ao instalar
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "clipSelection",
    title: "Salvar seleção no OmniMind",
    contexts: ["selection"]
  });
});

// Listener de clique no menu de contexto
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "clipSelection" && tab) {
    try {
      let html = "";
      let title = tab.title || "Nota da Web";
      let url = tab.url || "";

      // 1. Tenta injetar o script para obter a seleção estruturada em HTML
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return null;
            
            const container = document.createElement("div");
            for (let i = 0, len = selection.rangeCount; i < len; ++i) {
              container.appendChild(selection.getRangeAt(i).cloneNode(true));
            }
            return {
              html: container.innerHTML,
              title: document.title,
              url: window.location.href
            };
          }
        });

        if (results && results[0] && results[0].result) {
          html = results[0].result.html;
          title = results[0].result.title || title;
          url = results[0].result.url || url;
        }
      } catch (scriptingError) {
        console.warn("A injeção de script falhou (comum em PDFs ou páginas protegidas). Usando fallback nativo.", scriptingError);
      }

      // 2. Fallback robusto: se a injeção falhou ou retornou vazio, usa a seleção nativa do Chrome
      if (!html && info.selectionText) {
        html = info.selectionText;
      }

      if (!html) {
        showNotification("Erro", "Não foi possível obter a seleção de texto.");
        return;
      }
      
      // 3. Converte o HTML ou texto puro obtido para Markdown
      const markdown = htmlToMarkdown(html);

      // 4. Busca o workspace preferencial do storage
      const storage = await chrome.storage.local.get(["clipperWorkspaceId"]);
      const workspaceId = storage.clipperWorkspaceId || null;

      // 5. Envia para o backend do OmniMind
      const response = await fetch("http://localhost:3000/api/clipper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title,
          content: markdown,
          url: url,
          workspaceId: workspaceId
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${response.status}`);
      }

      const json = await response.json();
      if (json.success && json.noteId && json.workspaceId) {
        const noteUrl = `http://localhost:3000/dashboard/${json.workspaceId}/note/${json.noteId}`;
        const notificationId = "clip_" + Date.now();

        // Salva a associação no storage para cliques no balão
        await chrome.storage.local.set({ [`notif_${notificationId}`]: noteUrl });

        chrome.notifications.create(notificationId, {
          type: "basic",
          iconUrl: "icon.png",
          title: "Nota Salva!",
          message: "Clique aqui para abrir a nota no seu OmniMind.",
          priority: 2
        });
      } else if (json.success) {
        showNotification("Sucesso", "Seleção salva no seu OmniMind!");
      } else {
        throw new Error(json.error || "Erro desconhecido ao salvar.");
      }
    } catch (error) {
      console.error("Erro no Clipper:", error);
      showNotification("Erro ao salvar", error.message || "Tente novamente.");
    }
  }
});

// Listener de clique nas notificações para abrir a nota correspondente
chrome.notifications.onClicked.addListener(async (notificationId) => {
  const key = `notif_${notificationId}`;
  const storage = await chrome.storage.local.get([key]);
  const noteUrl = storage[key];
  if (noteUrl) {
    chrome.tabs.create({ url: noteUrl });
    chrome.storage.local.remove([key]); // Limpa a chave do storage
  }
});

// Exibe notificações genéricas
function showNotification(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png",
    title: title,
    message: message,
    priority: 2
  });
}

// Conversor HTML para Markdown Premium
function htmlToMarkdown(html) {
  if (!html) return "";

  // Se for texto puro (não contiver tags HTML), retorna diretamente
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return html.trim();
  }

  let md = html;

  // 1. Limpeza de tags de Script e Style inteiras (com seu conteúdo)
  md = md.replace(/<script[\s\S]*?<\/script>/gi, '');
  md = md.replace(/<style[\s\S]*?<\/style>/gi, '');

  // 2. Imagens
  md = md.replace(/<img[^>]+src=["']?([^"'\s>]+)["']?[^>]*>/gi, '![$1]($1)');

  // 3. Citações (Blockquotes)
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n> $1\n\n');

  // 4. Códigos em Bloco (<pre><code>)
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n\n');

  // 5. Quebras de linha e parágrafos
  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<\/p>/gi, "\n\n");
  md = md.replace(/<p[^>]*>/gi, "");

  // 6. Títulos (H1 a H6)
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n\n");
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n\n");
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n\n");
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n\n");

  // 7. Links com aspas simples, duplas ou sem aspas (regex robusta)
  md = md.replace(/<a[^>]+href=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");

  // 8. Ênfases (Strong, Bold, Italic)
  md = md.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**");
  md = md.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\2>/gi, "*$2*");

  // 9. Itens de Lista (LI, UL, OL)
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
  md = md.replace(/<\/?(ul|ol)[^>]*>/gi, "\n");

  // 10. Limpeza de tags HTML restantes
  md = md.replace(/<[^>]+>/g, "");

  // 11. Decodifica entidades HTML comuns
  md = md.replace(/&nbsp;/g, " ")
         .replace(/&lt;/g, "<")
         .replace(/&gt;/g, ">")
         .replace(/&amp;/g, "&")
         .replace(/&quot;/g, '"')
         .replace(/&#39;/g, "'");

  // 12. Normaliza quebras de linha múltiplas
  md = md.replace(/\n{3,}/g, "\n\n");

  return md.trim();
}
