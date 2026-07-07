import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
]

const fieldClass =
  'rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function pad2(n) {
  return String(n).padStart(2, '0')
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function Reportes() {
  const now = useMemo(() => new Date(), [])
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const today = useMemo(() => todayISO(), [])

  const [modo, setModo] = useState('mensual')
  const [anio, setAnio] = useState(currentYear)
  const [mes, setMes] = useState(currentMonth)
  const [desde, setDesde] = useState(today)
  const [hasta, setHasta] = useState(today)

  const [incluirEfectivo, setIncluirEfectivo] = useState(false)

  const [generando, setGenerando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [generandoPadron, setGenerandoPadron] = useState(false)
  const [enviandoPadron, setEnviandoPadron] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [error, setError] = useState(null)
  const [smtpHint, setSmtpHint] = useState(false)

  const busy = generando || enviando || generandoPadron || enviandoPadron

  const isCurrentYear = anio === currentYear
  const maxMes = isCurrentYear ? currentMonth : 12

  const yearOptions = useMemo(() => {
    const arr = []
    for (let y = currentYear; y >= currentYear - 5; y--) arr.push(y)
    return arr
  }, [currentYear])

  function handleAnioChange(newAnio) {
    setAnio(newAnio)
    if (newAnio === currentYear && mes > currentMonth) {
      setMes(currentMonth)
    }
  }

  function buildParams() {
    if (modo === 'mensual') return { modo, anio, mes, incluirEfectivo }
    return { modo, desde, hasta, incluirEfectivo }
  }

  function validarRango() {
    if (modo !== 'rango') return null
    if (!desde || !hasta) return 'Completá las fechas desde y hasta'
    if (desde > hasta) return 'La fecha "desde" no puede ser posterior a "hasta"'
    return null
  }

  function resetFeedback() {
    setFeedback(null)
    setError(null)
    setSmtpHint(false)
  }

  async function handleDescargar() {
    resetFeedback()
    const errMsg = validarRango()
    if (errMsg) {
      setError(errMsg)
      return
    }
    setGenerando(true)
    try {
      const res = await window.api.reportes.generar(buildParams())
      if (!res.ok) {
        setError(res.error.message)
        return
      }
      if (res.data.cancelado) return
      setFeedback(`PDF guardado en ${res.data.path}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerando(false)
    }
  }

  async function handleEnviar() {
    resetFeedback()
    const errMsg = validarRango()
    if (errMsg) {
      setError(errMsg)
      return
    }
    setEnviando(true)
    try {
      const res = await window.api.reportes.enviarMail(buildParams())
      if (!res.ok) {
        setError(res.error.message)
        if (res.error.code === 'SMTP_NO_CONFIGURADO') setSmtpHint(true)
        return
      }
      setFeedback('Mail enviado correctamente')
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  // El resumen de clientes siempre es mensual: usa el mes/año seleccionado para
  // calcular el importe de los clientes semanales (depende de la cantidad de lunes).
  // Respeta el mismo check de efectivo: sin tildar, excluye los grupos presenciales.
  function buildPadronParams() {
    return { tipoReporte: 'clientes', modo: 'mensual', anio, mes, incluirEfectivo }
  }

  async function handleDescargarPadron() {
    resetFeedback()
    setGenerandoPadron(true)
    try {
      const res = await window.api.reportes.generar(buildPadronParams())
      if (!res.ok) {
        setError(res.error.message)
        return
      }
      if (res.data.cancelado) return
      setFeedback(`Resumen guardado en ${res.data.path}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerandoPadron(false)
    }
  }

  async function handleEnviarPadron() {
    resetFeedback()
    setEnviandoPadron(true)
    try {
      const res = await window.api.reportes.enviarMail(buildPadronParams())
      if (!res.ok) {
        setError(res.error.message)
        if (res.error.code === 'SMTP_NO_CONFIGURADO') setSmtpHint(true)
        return
      }
      setFeedback('Resumen enviado correctamente')
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviandoPadron(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-4xl font-bold">Reportes</h1>

      <section className="mb-6 rounded-lg border bg-card p-4 space-y-4">
        <div>
          <span className="mb-2 block text-sm font-medium">Período</span>
          <div className="inline-flex rounded-md border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setModo('mensual')}
              className={`px-3 py-1.5 text-sm rounded ${
                modo === 'mensual' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
              disabled={busy}
            >
              Por mes
            </button>
            <button
              type="button"
              onClick={() => setModo('rango')}
              className={`px-3 py-1.5 text-sm rounded ${
                modo === 'rango' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
              disabled={busy}
            >
              Por rango de fechas
            </button>
          </div>
        </div>

        {modo === 'mensual' ? (
          <div className="flex gap-2">
            <select
              className={fieldClass}
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
              disabled={busy}
            >
              {MESES.map((nombre, i) => (
                <option key={i} value={i + 1} disabled={i + 1 > maxMes}>
                  {nombre}
                </option>
              ))}
            </select>
            <select
              className={fieldClass}
              value={anio}
              onChange={(e) => handleAnioChange(Number(e.target.value))}
              disabled={busy}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Desde</span>
              <input
                type="date"
                className={`${fieldClass} w-full`}
                value={desde}
                max={today}
                onChange={(e) => setDesde(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Hasta</span>
              <input
                type="date"
                className={`${fieldClass} w-full`}
                value={hasta}
                max={today}
                onChange={(e) => setHasta(e.target.value)}
                disabled={busy}
              />
            </label>
          </div>
        )}

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={incluirEfectivo}
            onChange={(e) => setIncluirEfectivo(e.target.checked)}
            disabled={busy}
          />
          <span className="text-sm">Incluir pagos en efectivo</span>
        </label>
      </section>

      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
          {smtpHint && (
            <div className="mt-1 text-xs">
              Andá a <span className="font-medium">Configuración</span> para completar las
              credenciales SMTP y el mail del contador.
            </div>
          )}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold">Reporte de pagos del período</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleDescargar} disabled={busy}>
            {generando ? 'Generando…' : 'Descargar PDF'}
          </Button>
          <Button variant="outline" onClick={handleEnviar} disabled={busy}>
            {enviando ? 'Enviando…' : 'Enviar al contador'}
          </Button>
        </div>
      </div>

      <div className="mt-6 border-t pt-6">
        <h2 className="text-sm font-semibold">Resumen de clientes</h2>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">
          Todos los clientes activos con lo que paga cada uno por mes, hayan pagado o no. Los
          alumnos de grupos presenciales (efectivo) se incluyen solo si tildás «Incluir pagos en
          efectivo». Calculado para {MESES[mes - 1]} {anio}.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleDescargarPadron} disabled={busy}>
            {generandoPadron ? 'Generando…' : 'Descargar resumen'}
          </Button>
          <Button variant="outline" onClick={handleEnviarPadron} disabled={busy}>
            {enviandoPadron ? 'Enviando…' : 'Enviar resumen al contador'}
          </Button>
        </div>
      </div>

      {feedback && <p className="mt-4 text-sm text-muted-foreground">{feedback}</p>}
    </div>
  )
}

export default Reportes
