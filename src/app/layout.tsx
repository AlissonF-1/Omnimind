import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OmniMind",
  description: "Sua central de estudos, notas e revisões inteligentes.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OmniMind",
  },
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icon-192x192.png",
    apple: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Splash Screen — aparece no primeiro paint e some após o app carregar */}
        <div
          id="omnimind-splash"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0f1117 0%, #111827 50%, #1a1040 100%)',
            transition: 'opacity 0.5s ease, visibility 0.5s ease',
          }}
        >
          {/* Glow de fundo */}
          <div style={{
            position: 'absolute',
            top: '30%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '280px',
            height: '280px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          {/* Logo */}
          <div style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
          }}>
            {/* Ícone com brilho */}
            <div style={{
              position: 'relative',
              width: '88px',
              height: '88px',
            }}>
              <div style={{
                position: 'absolute',
                inset: '-8px',
                borderRadius: '28px',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.4), rgba(139,92,246,0.2))',
                filter: 'blur(12px)',
              }} />
              <img
                src="/logo.png"
                alt="OmniMind"
                style={{
                  position: 'relative',
                  width: '88px',
                  height: '88px',
                  borderRadius: '20px',
                  objectFit: 'contain',
                }}
              />
            </div>

            {/* Nome */}
            <div style={{ textAlign: 'center' }}>
              <p style={{
                margin: 0,
                fontSize: '26px',
                fontWeight: 800,
                color: '#ffffff',
                letterSpacing: '-0.5px',
                fontFamily: 'system-ui, sans-serif',
              }}>
                OmniMind
              </p>
              <p style={{
                margin: '4px 0 0',
                fontSize: '13px',
                color: 'rgba(255,255,255,0.45)',
                fontFamily: 'system-ui, sans-serif',
                letterSpacing: '0.3px',
              }}>
                Seu segundo cérebro
              </p>
            </div>

            {/* Barra de loading */}
            <div style={{
              marginTop: '12px',
              width: '120px',
              height: '3px',
              borderRadius: '99px',
              background: 'rgba(255,255,255,0.1)',
              overflow: 'hidden',
            }}>
              <div
                id="omnimind-splash-bar"
                style={{
                  height: '100%',
                  width: '0%',
                  borderRadius: '99px',
                  background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                  transition: 'width 0.8s ease',
                }}
              />
            </div>
          </div>
        </div>

        {/* Script de remoção do splash — executa assim que o DOM estiver pronto */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  // Tema
                  var storedTheme = localStorage.getItem('omnimind-theme');
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  if (storedTheme === 'dark' || (!storedTheme && prefersDark)) {
                    document.documentElement.classList.add('dark');
                  }

                  // Anima a barra de loading
                  setTimeout(function() {
                    var bar = document.getElementById('omnimind-splash-bar');
                    if (bar) bar.style.width = '70%';
                  }, 100);

                  // Oculta o splash quando a página terminar de carregar
                  function removeSplash() {
                    var splash = document.getElementById('omnimind-splash');
                    var bar = document.getElementById('omnimind-splash-bar');
                    if (!splash) return;
                    if (bar) bar.style.width = '100%';
                    setTimeout(function() {
                      splash.style.opacity = '0';
                      splash.style.visibility = 'hidden';
                      splash.style.pointerEvents = 'none';
                    }, 300);
                  }

                  if (document.readyState === 'complete') {
                    removeSplash();
                  } else {
                    window.addEventListener('load', removeSplash);
                    // Fallback: remove após 3s mesmo que o load não dispare
                    setTimeout(removeSplash, 3000);
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
