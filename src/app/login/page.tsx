'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Loader2, Eye, EyeOff } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    setIsError(false)

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        setMessage(error.message)
        setIsError(true)
      } else {
        setMessage('Cadastro realizado. Verifique seu e-mail para confirmar a conta.')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setMessage(error.message)
        setIsError(true)
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    }

    setLoading(false)
  }

  const handleGoogleLogin = async () => {
    setMessage(null)
    setIsError(false)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setMessage(error.message)
      setIsError(true)
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-8 text-text-strong">
      <div className="mx-auto grid min-h-[calc(100vh-64px)] w-full max-w-6xl gap-10 lg:grid-cols-[0.9fr_1fr]">
        <section className="hidden flex-col justify-between rounded-lg border border-border bg-surface p-8 shadow-[var(--shadow-soft)] lg:flex">
          
          {/* --- ÍCONE SUBSTITUÍDO AQUI (Desktop) --- */}
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-3">
              <img 
                src="/logo.png" 
                alt="OmniMind Logo" 
                className="size-9 rounded-lg object-contain shrink-0" 
              />
              <span className="text-lg font-semibold">OmniMind</span>
            </Link>
            <ThemeToggle compact />
          </div>
          {/* --- FIM DA SUBSTITUIÇÃO --- */}

          <div>
            <p className="mb-3 text-sm font-medium text-primary">Estudo com sistema</p>
            <h1 className="max-w-md text-[40px] font-semibold leading-tight tracking-normal">
              Aprenda. Revise. Não esqueça.
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-text-medium">
              Suas notas, flashcards e revisões ficam no mesmo lugar, com menos ruído visual e mais foco.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="panel-muted p-4">
              <p className="font-semibold">Notas</p>
              <p className="mt-1 text-xs text-text-muted">Markdown</p>
            </div>
            <div className="panel-muted p-4">
              <p className="font-semibold">Cards</p>
              <p className="mt-1 text-xs text-text-muted">com IA</p>
            </div>
            <div className="panel-muted p-4">
              <p className="font-semibold">FSRS</p>
              <p className="mt-1 text-xs text-text-muted">revisão</p>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-md">
            
            {/* --- ÍCONE SUBSTITUÍDO AQUI (Mobile/Header) --- */}
            <div className="mb-10 flex items-center justify-between gap-3 lg:hidden">
              <Link href="/" className="flex items-center gap-3">
                <img 
                  src="/logo.png" 
                  alt="OmniMind Logo" 
                  className="size-9 rounded-lg object-contain shrink-0" 
                />
                <span className="text-lg font-semibold">OmniMind</span>
              </Link>
              <ThemeToggle compact />
            </div>
            {/* --- FIM DA SUBSTITUIÇÃO --- */}

            <div className="mb-8">
              <h2 className="page-title">{isSignUp ? 'Criar conta' : 'Entrar'}</h2>
              <p className="page-subtitle mt-2">Acesse seu espaço de estudos no OmniMind.</p>
            </div>

            <form onSubmit={handleAuth} className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text-strong">E-mail</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@email.com"
                  className="field"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text-strong">Senha</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  className="field"
                  autoComplete="current-password"
                  id="password"
                />

                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="text-sm font-medium text-primary transition-colors hover:text-primary-hover flex items-center gap-2"
                    aria-pressed={showPassword}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    {showPassword ? 'Ocultar' : 'Mostrar'} senha
                  </button>
                </div>
              </label>

              {message && (
                <div
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    isError
                      ? 'border-error/25 bg-error-soft text-error'
                      : 'border-success/25 bg-success-soft text-success'
                  }`}
                >
                  {message}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                {loading ? 'Aguarde...' : isSignUp ? 'Criar conta' : 'Entrar'}
                {!loading ? <ArrowRight className="size-4" /> : null}
              </button>
            </form>

            <div className="mt-4">
              <button type="button" onClick={handleGoogleLogin} className="btn-secondary w-full">
                <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Entrar com Google
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setMessage(null)
              }}
              className="mt-6 text-sm font-medium text-primary transition-colors hover:text-primary-hover"
            >
              {isSignUp ? 'Já tenho conta' : 'Ainda não tenho conta'}
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}