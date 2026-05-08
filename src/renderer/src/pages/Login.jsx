import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

const fieldClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function Login({ onSuccess }) {
  const [checking, setChecking] = useState(true)
  const [hasPassword, setHasPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function checkInitial() {
      try {
        const res = await window.api.auth.verify('')
        if (cancelled) return
        if (res.ok && res.data.authenticated) {
          onSuccess()
          return
        }
        setHasPassword(true)
      } catch {
        if (!cancelled) setHasPassword(true)
      } finally {
        if (!cancelled) setChecking(false)
      }
    }
    checkInitial()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await window.api.auth.verify(password)
      if (!res.ok) {
        setError(res.error.message)
        setSubmitting(false)
        return
      }
      if (res.data.authenticated) {
        onSuccess()
      } else {
        setError('Contraseña incorrecta')
        setSubmitting(false)
      }
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  if (checking) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">Cargando…</div>
    )
  }

  if (!hasPassword) {
    // Caso transitorio: ya disparamos onSuccess(); no mostrar nada para evitar flash.
    return null
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-sm"
      >
        <div>
          <h1 className="text-2xl font-bold">Gestión Contable</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ingresá tu contraseña para continuar.
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Contraseña</span>
          <input
            type="password"
            className={fieldClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            autoFocus
          />
        </label>

        {error && (
          <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>
        )}

        <Button type="submit" disabled={submitting || password.length === 0} className="w-full">
          {submitting ? 'Verificando…' : 'Entrar'}
        </Button>
      </form>
    </div>
  )
}

export default Login
