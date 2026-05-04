import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { authApi } from '@/lib/api'
import { useAuthStore, type AuthOperator } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TundraLogo } from '@/components/TundraLogo'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const setOperator = useAuthStore((s) => s.setOperator)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await authApi.login({ email, password })
      setOperator(res.operator as AuthOperator)
      await router.navigate({ to: '/dashboard' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-105 xl:w-120 shrink-0 flex-col justify-between bg-tundra-ink-900 px-10 py-12">
        <div className="flex items-center gap-3">
          <TundraLogo size={40} variant="dark" />
          <span className="text-xl font-semibold tracking-tight text-tundra-paper">Tundra</span>
        </div>

        <div className="space-y-4">
          <p className="text-3xl font-semibold leading-snug text-tundra-paper">
            Self-hosted server<br />management — done right.
          </p>
          <p className="text-sm leading-relaxed text-tundra-ink-400">
            One binary. No licensing fees. Full control over your servers,
            sites, databases, and deployments from a single panel.
          </p>
        </div>

        <div className="space-y-3">
          <Feature text="Multi-server fleet with mTLS agent mesh" />
          <Feature text="Blue/green deployments across 6 runtimes" />
          <Feature text="Wasmtime plugin host · MCP AI integration" />
          <Feature text="SLSA Level 3 · AES-256-GCM · Argon2id" />
          <div className="pt-2 text-xs text-tundra-ink-600">v1.0.0 · General Availability</div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 flex-col items-center justify-center bg-tundra-paper px-6 py-12">
        {/* Mobile logo (hidden on lg+) */}
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <TundraLogo size={36} variant="light" />
          <span className="text-xl font-semibold text-tundra-ink">Tundra</span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-tundra-ink">Welcome back</h1>
            <p className="mt-1 text-sm text-tundra-ink-500">Sign in to your Tundra panel</p>
          </div>

          <form
            onSubmit={(e) => { void handleSubmit(e) }}
            className="flex flex-col gap-5"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-tundra-ink-700">
                Email address
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="operator@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value) }}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-tundra-ink-700">
                Password
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value) }}
                required
              />
            </div>

            <Button type="submit" loading={loading} className="mt-1 w-full">
              Sign in
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-tundra-ink-400">
            Access is restricted to authorised operators.
          </p>
        </div>
      </div>
    </div>
  )
}

function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 text-sm text-tundra-ink-400">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-tundra-lichen-500" />
      <span>{text}</span>
    </div>
  )
}
