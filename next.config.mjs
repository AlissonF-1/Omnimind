import withPWAInit from '@ducanh2912/next-pwa';

// Inicializa o plugin separadamente
const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  skipWaiting: true,
  cacheOnFrontEndNav: true,
  disable: process.env.DISABLE_PWA === 'true',
  importScripts: ['/sw-custom.js']
});

const nextConfig = {
  // Adicionamos um objeto vazio para silenciar o aviso do Turbopack
  turbopack: {}
};

// Aplica o PWA em volta da sua configuração
export default withPWA(nextConfig);