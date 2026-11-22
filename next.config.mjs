import withPWAInit from '@ducanh2912/next-pwa';

// Inicializa o plugin separadamente
const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  skipWaiting: true,
  // O worker extra grava páginas no Cache API sem consultar Cache-Control.
  cacheOnFrontEndNav: false,
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [{
      urlPattern: ({ url, sameOrigin }) => {
        if (!sameOrigin) return false;
        try {
          return /^\/dashboard\/questoes(?:\/|$)/.test(decodeURI(url.pathname));
        } catch {
          return false;
        }
      },
      handler: 'NetworkOnly',
      options: { fetchOptions: { cache: 'no-store' } },
    }],
  },
  disable: process.env.DISABLE_PWA === 'true',
  importScripts: ['/sw-custom.js']
});

const nextConfig = {
  // Adicionamos um objeto vazio para silenciar o aviso do Turbopack
  turbopack: {},
  async headers() {
    return [{
      source: '/dashboard/questoes/:path*',
      headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
    }];
  },
};

// Aplica o PWA em volta da sua configuração
export default withPWA(nextConfig);
