// Função para carregar os workspaces da sua API
async function loadWorkspaces() {
  const select = document.getElementById('workspaceSelect');
  const status = document.getElementById('status');
  
  select.innerHTML = '<option value="">Carregando...</option>';
  status.innerHTML = '';
  status.className = '';

  try {
    const response = await fetch('http://localhost:3000/api/clipper/workspaces', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || `Erro ${response.status}`);
    }

    const json = await response.json();
    if (json.error) throw new Error(json.error);

    // Garante que workspaces sempre seja um array
    const workspaces = json.workspaces || [];
    
    select.innerHTML = '';

    if (workspaces.length === 0) {
      // Se não tiver workspace, desabilita e avisa o usuário
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Nenhum workspace. Crie um no app.';
      option.disabled = true;
      select.appendChild(option);
      select.disabled = true; // Desabilita o dropdown
    } else {
      select.disabled = false;
      workspaces.forEach((ws) => {
        const option = document.createElement('option');
        option.value = ws.id;
        option.textContent = ws.name;
        select.appendChild(option);
      });

      // Recupera a preferência salva e seleciona ela automaticamente
      const result = await chrome.storage.local.get(['clipperWorkspaceId']);
      if (result.clipperWorkspaceId) {
        select.value = result.clipperWorkspaceId;
      }

      // Se o select ainda estiver vazio (não carregou ou usuário não tem preferência), seleciona o primeiro
      if (select.value === '' && select.options.length > 0) {
        select.value = select.options[0].value;
      }
    }

  } catch (error) {
    console.error('Erro ao carregar workspaces:', error);
    select.innerHTML = '<option value="">Erro ao carregar</option>';
    status.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> <span>Erro: ${error.message}</span>`;
    status.className = 'error';
  }
}

// Quando o usuário trocar o dropdown, salva imediatamente no navegador
document.getElementById('workspaceSelect').addEventListener('change', async (e) => {
  const selectedValue = e.target.value;
  if (selectedValue) {
    await chrome.storage.local.set({ clipperWorkspaceId: selectedValue });
  }
});

// Carrega os workspaces assim que o popup abrir
document.addEventListener('DOMContentLoaded', loadWorkspaces);

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

function showNotification(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png",
    title: title,
    message: message,
    priority: 2
  });
}

// Evento de clique do botão Salvar
document.getElementById('clipBtn').addEventListener('click', async () => {
  const status = document.getElementById('status');
  const btn = document.getElementById('clipBtn');
  const select = document.getElementById('workspaceSelect');
  
  btn.disabled = true;
  status.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; animation: spin 1s linear infinite;" class="animate-spin"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg> <span>Capturando conteúdo...</span>`;
  status.className = 'loading';

  try {
    // Pega a aba ativa
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const selectors = [
          '.post__content', '.materia-conteudo', '.conteudo',
          '.mw-parser-output', '.article-content', '.post-content', 
          '.entry-content', '.post-body', '#content',
          'article', '[role="article"]',
          'main', '[role="main"]'
        ];
        let targetElement = null;
        for (let selector of selectors) {
          targetElement = document.querySelector(selector);
          if (targetElement) break;
        }
        const html = targetElement ? targetElement.innerHTML : document.body.innerHTML;
        return { title: document.title, html: html, url: window.location.href };
      }
    });

    const data = results[0].result;
    status.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; animation: spin 1s linear infinite;" class="animate-spin"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg> <span>Convertendo para Markdown...</span>`;

    const markdown = htmlToMarkdown(data.html);

    status.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; animation: spin 1s linear infinite;" class="animate-spin"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg> <span>Enviando para o OmniMind...</span>`;
    
    const response = await fetch('http://localhost:3000/api/clipper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: data.title,
        content: markdown,
        url: data.url,
        workspaceId: select.value // Envia o workspace selecionado
      }),
      credentials: 'include'
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || `Erro ${response.status}`);
    }

    const json = await response.json();
    if (json.success && json.noteId && json.workspaceId) {
      status.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg> <span>Nota salva com sucesso!</span>`;
      status.className = 'success';

      const noteUrl = `http://localhost:3000/dashboard/${json.workspaceId}/note/${json.noteId}`;
      const notificationId = "clip_" + Date.now();

      // Salva a associação no storage para cliques no balão
      await chrome.storage.local.set({ [`notif_${notificationId}`]: noteUrl });

      chrome.notifications.create(notificationId, {
        type: "basic",
        iconUrl: "icon.png",
        title: "Página Salva!",
        message: "Clique aqui para abrir a nota no seu OmniMind.",
        priority: 2
      });

      setTimeout(() => window.close(), 1200);
    } else if (json.success) {
      status.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg> <span>Página salva com sucesso!</span>`;
      status.className = 'success';
      showNotification("Sucesso", "Página salva no seu OmniMind!");
      setTimeout(() => window.close(), 1200);
    } else {
      status.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> <span>Erro: ${json.error}</span>`;
      status.className = 'error';
    }
  } catch (err) {
    console.error("Erro detalhado do Clipper:", err);
    status.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> <span>Erro: ${err.message}</span>`;
    status.className = 'error';
  } finally {
    btn.disabled = false;
  }
});