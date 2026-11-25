import withPWAInit from '@ducanh2912/next-pwa';

// Inicializa o plugin separadamente
const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  skipWaiting: true,
  cacheStartUrl: false,
  dynamicStartUrl: false,
  cacheOnFrontEndNav: false,
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [{
      urlPattern: ({ url, sameOrigin, request }) => {
        if (request?.headers.has('Authorization')) return true;
        try {
          const path = decodeURI(url.pathname);
          return sameOrigin
            ? /^\/(?:dashboard|api|auth)(?:\/|$)/.test(path)
            : /^\/(?:auth|rest|storage|functions)\/v1(?:\/|$)/.test(path)
              && !path.startsWith('/storage/v1/object/public/');
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
  serverExternalPackages: ['pdf-parse'],
  // Adicionamos um objeto vazio para silenciar o aviso do Turbopack
  turbopack: {},
  async headers() {
    return ['/dashboard/:path*', '/api/pdf/:path*', '/api/push/:path*'].map((source) => ({
      source,
      headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
    }));
  },
};

// Aplica o PWA em volta da sua configuração
export default withPWA(nextConfig);
