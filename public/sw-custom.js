// Service Worker Customizado — OmniMind PWA

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  const obsoleteCaches = new Set([
    'omnimind-pages-cache', 'pages', 'pages-rsc', 'pages-rsc-prefetch',
    'apis', 'cross-origin', 'start-url',
  ])
  event.waitUntil(caches.keys().then((names) => Promise.all(
    names.filter((name) => obsoleteCaches.has(name) || name.startsWith('omnimind-old-'))
      .map((name) => caches.delete(name)),
  )).then(() => self.clients.claim()))
})

// As rotas privadas em modo de navegação são sempre tratadas pela rede.
self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.mode !== 'navigate' || url.origin !== self.location.origin) return

  try {
    if (/^\/(?:dashboard|api|auth)(?:\/|$)/.test(decodeURI(url.pathname))) return
  } catch {
    return
  }

  event.respondWith(fetch(request).catch(() => new Response(
    '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>OmniMind offline</title><h1>Você está sem conexão</h1><p>Reconecte para abrir seus estudos.</p></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, status: 503 },
  )))
})
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
      icon: '/icon-transparent-192.png?v=2',
      badge: '/notification-badge.png?v=2',
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
            icon: '/icon-transparent-192.png?v=2',
            badge: '/notification-badge.png?v=2',
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
