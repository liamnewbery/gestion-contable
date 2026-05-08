import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

const fieldClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const initialConfig = {
  mail_contador: '',
  imap_host: '',
  imap_port: '',
  imap_user: '',
  imap_pass: '',
  smtp_host: '',
  smtp_port: '',
  smtp_user: '',
  smtp_pass: '',
  anthropic_api_key: ''
}

const initialSectionState = {
  saving: false,
  saved: false,
  error: null,
  testing: false,
  testResult: null
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

function PasswordInput({ value, onChange }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        className={`${fieldClass} pr-10`}
        value={value}
        onChange={onChange}
      />
      <button
        type="button"
        aria-label={show ? 'Ocultar' : 'Mostrar'}
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

function SaveFeedback({ saved, error }) {
  if (error) {
    return <span className="text-sm text-destructive">{error}</span>
  }
  if (saved) {
    return <span className="text-sm text-green-600">Guardado</span>
  }
  return null
}

function TestFeedback({ testing, testResult, successMessage = 'Conexión exitosa' }) {
  if (testing) {
    return <span className="text-sm text-muted-foreground">Probando…</span>
  }
  if (!testResult) return null
  if (testResult.ok) {
    return <span className="text-sm text-green-600">{successMessage}</span>
  }
  return <span className="text-sm text-destructive">{testResult.message}</span>
}

function Configuracion() {
  const [config, setConfig] = useState(initialConfig)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState(null)

  const [sections, setSections] = useState({
    contador: { ...initialSectionState },
    imap: { ...initialSectionState },
    smtp: { ...initialSectionState },
    ai: { ...initialSectionState }
  })

  const [backup, setBackup] = useState({ running: false, success: false, error: null })
  const [restore, setRestore] = useState({ running: false, error: null })

  function updateSection(name, patch) {
    setSections((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }))
  }

  function setField(clave, valor) {
    setConfig((prev) => ({ ...prev, [clave]: valor }))
  }

  async function loadConfig() {
    setLoading(true)
    setPageError(null)
    try {
      const res = await window.api.configuracion.getAll()
      if (!res.ok) {
        setPageError(res.error.message)
        return
      }
      setConfig({ ...initialConfig, ...res.data })
    } catch (err) {
      setPageError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConfig()
  }, [])

  async function saveSection(name, claves) {
    updateSection(name, { saving: true, saved: false, error: null })
    try {
      for (const k of claves) {
        const res = await window.api.configuracion.set(k, config[k])
        if (!res.ok) {
          updateSection(name, { saving: false, error: res.error.message })
          return
        }
      }
      updateSection(name, { saving: false, saved: true, error: null })
      setTimeout(() => {
        // Limpiar el "Guardado" después de 2s
        setSections((prev) => {
          if (!prev[name].saved) return prev
          return { ...prev, [name]: { ...prev[name], saved: false } }
        })
      }, 2000)
    } catch (err) {
      updateSection(name, { saving: false, error: err.message })
    }
  }

  async function testImap() {
    updateSection('imap', { testing: true, testResult: null })
    try {
      const res = await window.api.configuracion.testImap(
        config.imap_host,
        config.imap_port,
        config.imap_user,
        config.imap_pass
      )
      updateSection('imap', {
        testing: false,
        testResult: res.ok ? { ok: true } : { ok: false, message: res.error.message }
      })
    } catch (err) {
      updateSection('imap', {
        testing: false,
        testResult: { ok: false, message: err.message }
      })
    }
  }

  async function testSmtp() {
    updateSection('smtp', { testing: true, testResult: null })
    try {
      const res = await window.api.configuracion.testSmtp(
        config.smtp_host,
        config.smtp_port,
        config.smtp_user,
        config.smtp_pass
      )
      updateSection('smtp', {
        testing: false,
        testResult: res.ok ? { ok: true } : { ok: false, message: res.error.message }
      })
    } catch (err) {
      updateSection('smtp', {
        testing: false,
        testResult: { ok: false, message: err.message }
      })
    }
  }

  async function handleBackup() {
    setBackup({ running: true, success: false, error: null })
    try {
      const res = await window.api.db.backup()
      if (!res.ok) {
        setBackup({ running: false, success: false, error: res.error.message })
        return
      }
      if (res.data.cancelado) {
        setBackup({ running: false, success: false, error: null })
        return
      }
      setBackup({ running: false, success: true, error: null })
      setTimeout(() => {
        setBackup((prev) => (prev.success ? { ...prev, success: false } : prev))
      }, 3000)
    } catch (err) {
      setBackup({ running: false, success: false, error: err.message })
    }
  }

  async function handleRestore() {
    const confirmado = window.confirm(
      '¿Seguro que querés restaurar el backup? Esto va a reemplazar todos los datos actuales y la app se va a reiniciar.'
    )
    if (!confirmado) return
    setRestore({ running: true, error: null })
    try {
      const res = await window.api.db.restore()
      if (!res.ok) {
        setRestore({ running: false, error: res.error.message })
        return
      }
      // Si la restauración tuvo éxito, el main process llamó a app.relaunch()
      // y la ventana se está cerrando. Si fue cancelada, simplemente limpiamos.
      setRestore({ running: false, error: null })
    } catch (err) {
      setRestore({ running: false, error: err.message })
    }
  }

  async function testAnthropic() {
    updateSection('ai', { testing: true, testResult: null })
    try {
      const res = await window.api.configuracion.testAnthropic(config.anthropic_api_key)
      updateSection('ai', {
        testing: false,
        testResult: res.ok ? { ok: true } : { ok: false, message: res.error.message }
      })
    } catch (err) {
      updateSection('ai', {
        testing: false,
        testResult: { ok: false, message: err.message }
      })
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl">
        <h1 className="mb-6 text-4xl font-bold">Configuración</h1>
        <p className="text-muted-foreground">Cargando…</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-4xl font-bold">Configuración</h1>

      {pageError && (
        <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {pageError}
        </div>
      )}

      {/* SECCIÓN 1 — Correo del contador */}
      <Section title="Correo del contador">
        <Field label="Mail del contador">
          <input
            type="email"
            className={fieldClass}
            value={config.mail_contador}
            onChange={(e) => setField('mail_contador', e.target.value)}
          />
        </Field>
        <SectionFooter>
          <SaveFeedback saved={sections.contador.saved} error={sections.contador.error} />
          <Button
            onClick={() => saveSection('contador', ['mail_contador'])}
            disabled={sections.contador.saving}
          >
            {sections.contador.saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </SectionFooter>
      </Section>

      {/* SECCIÓN 2 — IMAP */}
      <Section title="Correo entrante (IMAP)">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Host">
            <input
              type="text"
              className={fieldClass}
              value={config.imap_host}
              onChange={(e) => setField('imap_host', e.target.value)}
            />
          </Field>
          <Field label="Puerto">
            <input
              type="number"
              className={fieldClass}
              value={config.imap_port}
              onChange={(e) => setField('imap_port', e.target.value)}
            />
          </Field>
          <Field label="Usuario">
            <input
              type="text"
              className={fieldClass}
              value={config.imap_user}
              onChange={(e) => setField('imap_user', e.target.value)}
            />
          </Field>
          <Field label="Contraseña">
            <PasswordInput
              value={config.imap_pass}
              onChange={(e) => setField('imap_pass', e.target.value)}
            />
          </Field>
        </div>
        <SectionFooter>
          <div className="flex flex-wrap items-center gap-3">
            <SaveFeedback saved={sections.imap.saved} error={sections.imap.error} />
            <TestFeedback testing={sections.imap.testing} testResult={sections.imap.testResult} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={testImap} disabled={sections.imap.testing}>
              {sections.imap.testing ? 'Probando…' : 'Probar conexión'}
            </Button>
            <Button
              onClick={() =>
                saveSection('imap', ['imap_host', 'imap_port', 'imap_user', 'imap_pass'])
              }
              disabled={sections.imap.saving}
            >
              {sections.imap.saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </SectionFooter>
      </Section>

      {/* SECCIÓN 3 — SMTP */}
      <Section title="Correo saliente (SMTP)">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Host">
            <input
              type="text"
              className={fieldClass}
              value={config.smtp_host}
              onChange={(e) => setField('smtp_host', e.target.value)}
            />
          </Field>
          <Field label="Puerto">
            <input
              type="number"
              className={fieldClass}
              value={config.smtp_port}
              onChange={(e) => setField('smtp_port', e.target.value)}
            />
          </Field>
          <Field label="Usuario">
            <input
              type="text"
              className={fieldClass}
              value={config.smtp_user}
              onChange={(e) => setField('smtp_user', e.target.value)}
            />
          </Field>
          <Field label="Contraseña">
            <PasswordInput
              value={config.smtp_pass}
              onChange={(e) => setField('smtp_pass', e.target.value)}
            />
          </Field>
        </div>
        <SectionFooter>
          <div className="flex flex-wrap items-center gap-3">
            <SaveFeedback saved={sections.smtp.saved} error={sections.smtp.error} />
            <TestFeedback testing={sections.smtp.testing} testResult={sections.smtp.testResult} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={testSmtp} disabled={sections.smtp.testing}>
              {sections.smtp.testing ? 'Probando…' : 'Probar conexión'}
            </Button>
            <Button
              onClick={() =>
                saveSection('smtp', ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass'])
              }
              disabled={sections.smtp.saving}
            >
              {sections.smtp.saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </SectionFooter>
      </Section>

      {/* SECCIÓN 4 — IA */}
      <Section title="Inteligencia artificial">
        <Field label="API Key de Claude">
          <PasswordInput
            value={config.anthropic_api_key}
            onChange={(e) => setField('anthropic_api_key', e.target.value)}
          />
        </Field>
        <SectionFooter>
          <div className="flex flex-wrap items-center gap-3">
            <SaveFeedback saved={sections.ai.saved} error={sections.ai.error} />
            <TestFeedback
              testing={sections.ai.testing}
              testResult={sections.ai.testResult}
              successMessage="API key válida"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={testAnthropic} disabled={sections.ai.testing}>
              {sections.ai.testing ? 'Probando…' : 'Probar'}
            </Button>
            <Button
              onClick={() => saveSection('ai', ['anthropic_api_key'])}
              disabled={sections.ai.saving}
            >
              {sections.ai.saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </SectionFooter>
      </Section>

      {/* SECCIÓN 5 — Backup y restauración */}
      <Section title="Backup y restauración">
        <p className="text-sm text-muted-foreground">
          Exportá una copia de la base de datos como archivo .sqlite, o restaurá una copia previa.
          Al restaurar, la app se va a reiniciar.
        </p>
        <SectionFooter>
          <div className="flex flex-wrap items-center gap-3">
            {backup.success && <span className="text-sm text-green-600">Backup guardado</span>}
            {backup.error && <span className="text-sm text-destructive">{backup.error}</span>}
            {restore.error && <span className="text-sm text-destructive">{restore.error}</span>}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleBackup}
              disabled={backup.running || restore.running}
            >
              {backup.running ? 'Exportando…' : 'Exportar backup'}
            </Button>
            <Button
              variant="outline"
              onClick={handleRestore}
              disabled={backup.running || restore.running}
            >
              {restore.running ? 'Restaurando…' : 'Restaurar backup'}
            </Button>
          </div>
        </SectionFooter>
      </Section>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="mb-6 space-y-4 rounded-lg border bg-card p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function SectionFooter({ children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      {children}
    </div>
  )
}

export default Configuracion
