// Service Worker Customizado — OmniMind PWA

const CACHE_NAME = 'omnimind-static-v1';

// Pre-cache básico e ativação imediata
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Remove apenas caches muito antigos especificamente marcados
          if (cacheName.startsWith('omnimind-old-')) {
            console.log('[SW] Limpando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
// Intercepta e faz cache de requisições de páginas HTML para navegação offline
self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open('omnimind-pages-cache').then((cache) => {
              cache.put(request, copy);
            });
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open('omnimind-pages-cache');
          const cachedResponse = await cache.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }

          const fallbackRevisoes = await cache.match('/dashboard/revisoes');
          if (fallbackRevisoes) return fallbackRevisoes;

          const fallbackDash = await cache.match('/dashboard');
          if (fallbackDash) return fallbackDash;

          return new Response(
            `<!DOCTYPE html>
            <html lang="pt-BR">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>OmniMind - Offline</title>
              <style>
                body { background: #111827; color: #fff; font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; padding: 20px; box-sizing: border-box; }
                h1 { color: #6366f1; margin-bottom: 8px; font-size: 24px; }
                p { color: #9ca3af; max-width: 400px; margin-bottom: 24px; font-size: 14px; line-height: 1.5; }
                a { background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 14px; box-shadow: 0 4px 14px rgba(99,102,241,0.4); }
              </style>
            </head>
            <body>
              <h1>🧠 OmniMind Offline</h1>
              <p>Você está sem conexão com a internet. Abra suas revisões salvas localmente:</p>
              <a href="/dashboard/revisoes">Abrir Revisão Ativa</a>
            </body>
            </html>`,
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
  }
});

// Gerencia Notificações Push do OmniMind
self.addEventListener('push', (event) => {
  try {
    let payload = {
      title: 'OmniMind',
      body: 'Você tem revisões agendadas para hoje!',
      url: '/dashboard/revisoes'
    };

    if (event.data) {
      payload = event.data.json();
    }

    const options = {
      body: payload.body,
      icon: '/icon-192x192.png',
      badge: '/notification-badge.png',
      vibrate: [100, 50, 100],
      data: {
        url: payload.url || '/dashboard/revisoes'
      }
    };

    event.waitUntil(
      self.registration.showNotification(payload.title, options)
    );
  } catch (err) {
    console.error('Erro ao receber evento de Push:', err);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Se o usuário clicou em "Lembrar em 1h"
  if (event.action === 'snooze-1h') {
    console.log('🕒 Usuário pediu para lembrar em 1 hora');
    event.waitUntil(
      new Promise((resolve) => {
        setTimeout(() => {
          self.registration.showNotification('🔥 Hora de Estudo OmniMind!', {
            body: 'Lembrete: Vamos voltar aos seus estudos acumulados?',
            icon: '/icon-192x192.png',
            badge: '/notification-badge.png',
            sound: '/notification_sound.mp3',
            data: { url: '/dashboard/revisoes' },
            actions: [
              { action: 'review-now', title: '✅ Revisar agora' }
            ]
          }).then(resolve);
        }, 3600000); // 1 hora
      })
    );
    return;
  }

  // Ação padrão (clicar no corpo da notificação ou em "Revisar agora")
  const targetUrl = event.notification.data?.url || '/dashboard/revisoes';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/dashboard') && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url: targetUrl });
          return client.focus();
        }
      }
      
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
