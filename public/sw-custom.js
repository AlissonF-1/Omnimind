// Service Worker Customizado — OmniMind PWA

// Ao ativar um novo SW, limpa todos os caches antigos
// Isso resolve o "page couldn't load" quando o sw.js é regenerado no build
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Remove caches que não pertencem ao SW atual
          console.log('[SW] Limpando cache antigo:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      // Assume controle de todos os clientes imediatamente
      return self.clients.claim();
    })
  );
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
