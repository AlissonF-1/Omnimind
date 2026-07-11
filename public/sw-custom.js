// Service Worker Customizado para gerenciar Notificações Push do OmniMind PWA
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
      icon: '/logo.png', // Logo oficial
      badge: '/logo.png', // Badge de status do celular
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
  
  // Abre o app e direciona para a tela de revisões
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const targetUrl = event.notification.data.url;
      
      // Se houver uma aba aberta no site, foca nela
      for (const client of clientList) {
        if (client.url.includes('/dashboard') && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url: targetUrl });
          return client.focus();
        }
      }
      
      // Caso contrário, abre uma nova aba
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
