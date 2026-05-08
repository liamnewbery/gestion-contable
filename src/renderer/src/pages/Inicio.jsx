import { useEffect, useMemo, useState } from 'react'
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

function formatPesos(n) {
  if (n == null) return '$0'
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

function fullName(p) {
  return `${p.nombre} ${p.apellido}`
}

function Inicio() {
  const now = useMemo(() => new Date(), [])
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const [anio, setAnio] = useState(currentYear)
  const [mes, setMes] = useState(currentMonth)
  const [resumen, setResumen] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [expanded, setExpanded] = useState({
    pacientes: false,
    alumnos_grupales: false,
    alumnos_particulares: false
  })

  const isCurrentYear = anio === currentYear
  const maxMes = isCurrentYear ? currentMonth : 12
  const periodoActual = `${anio}-${String(mes).padStart(2, '0')}`

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

  async function loadResumen() {
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.dashboard.resumen(anio, mes)
      if (!res.ok) {
        setError(res.error.message)
        setResumen(null)
        return
      }
      setResumen(res.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    loadResumen()
  }, [anio, mes])

  function toggle(key) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-4xl font-bold">Inicio</h1>
        <div className="flex items-center gap-2">
          <select
            className={fieldClass}
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
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
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {resumen && (
        <div className="mb-6 grid grid-cols-2 gap-6">
          <div>
            <div className="text-sm text-muted-foreground">Cobrado este mes</div>
            <div className="text-3xl font-semibold">
              {formatPesos(
                resumen.pacientes.monto_cobrado +
                  resumen.alumnos_grupales.monto_cobrado +
                  resumen.alumnos_particulares.monto_cobrado
              )}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Por cobrar</div>
            <div className="text-3xl font-semibold">
              {formatPesos(
                [
                  ...resumen.pacientes.pendientes,
                  ...resumen.alumnos_grupales.pendientes,
                  ...resumen.alumnos_particulares.pendientes
                ].reduce((s, p) => s + p.saldo, 0)
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : resumen ? (
        <>
          {resumen.pagos_en_revision > 0 && (
            <div className="mb-4 flex items-center gap-3 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm">
              <span className="text-lg" aria-hidden="true">
                ⚠
              </span>
              <span>
                Hay <span className="font-semibold">{resumen.pagos_en_revision}</span>{' '}
                {resumen.pagos_en_revision === 1
                  ? 'comprobante pendiente'
                  : 'comprobantes pendientes'}{' '}
                de revisión.
              </span>
            </div>
          )}

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <RoleCard title="Pacientes" data={resumen.pacientes} />
            <RoleCard title="Alumnos grupales" data={resumen.alumnos_grupales} />
            <RoleCard title="Alumnos particulares" data={resumen.alumnos_particulares} />
          </div>

          <div className="space-y-4">
            <PendientesSection
              title="Pacientes pendientes"
              count={resumen.pacientes.pendientes.length}
              expanded={expanded.pacientes}
              onToggle={() => toggle('pacientes')}
            >
              {resumen.pacientes.pendientes.length === 0 ? (
                <EmptyRow text="No hay pacientes pendientes este mes." />
              ) : (
                <ul className="divide-y">
                  {resumen.pacientes.pendientes.map((p) => (
                    <SimpleRow
                      key={p.paciente_id}
                      nombre={fullName(p)}
                      monto={p.monto_mes}
                      monto_cobrado={p.monto_cobrado}
                      saldo={p.saldo}
                      persona_id={p.persona_id}
                      rol_tipo="paciente"
                      rol_id={p.paciente_id}
                      periodo_cubierto={periodoActual}
                      onSuccess={loadResumen}
                    />
                  ))}
                </ul>
              )}
            </PendientesSection>

            <PendientesSection
              title="Alumnos grupales pendientes"
              count={resumen.alumnos_grupales.pendientes.length}
              expanded={expanded.alumnos_grupales}
              onToggle={() => toggle('alumnos_grupales')}
            >
              {resumen.alumnos_grupales.pendientes.length === 0 ? (
                <EmptyRow text="No hay alumnos grupales pendientes este mes." />
              ) : (
                <ul className="divide-y">
                  {resumen.alumnos_grupales.pendientes.map((a) => (
                    <AlumnoGrupalRow
                      key={a.alumno_id}
                      alumno={a}
                      periodo_cubierto={periodoActual}
                      onSuccess={loadResumen}
                    />
                  ))}
                </ul>
              )}
            </PendientesSection>

            <PendientesSection
              title="Alumnos particulares pendientes"
              count={resumen.alumnos_particulares.pendientes.length}
              expanded={expanded.alumnos_particulares}
              onToggle={() => toggle('alumnos_particulares')}
            >
              {resumen.alumnos_particulares.pendientes.length === 0 ? (
                <EmptyRow text="No hay alumnos particulares pendientes este mes." />
              ) : (
                <ul className="divide-y">
                  {resumen.alumnos_particulares.pendientes.map((p) => (
                    <SimpleRow
                      key={p.alumno_particular_id}
                      nombre={fullName(p)}
                      monto={p.monto_mes}
                      monto_cobrado={p.monto_cobrado}
                      saldo={p.saldo}
                      persona_id={p.persona_id}
                      rol_tipo="alumno_particular"
                      rol_id={p.alumno_particular_id}
                      periodo_cubierto={periodoActual}
                      onSuccess={loadResumen}
                    />
                  ))}
                </ul>
              )}
            </PendientesSection>
          </div>
        </>
      ) : null}
    </div>
  )
}

function RoleCard({ title, data }) {
  const pct = data.total > 0 ? (data.pagaron / data.total) * 100 : 0
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      <div>
        <div className="flex items-center justify-between text-sm">
          <span>
            <span className="font-semibold">{data.pagaron}</span>
            <span className="text-muted-foreground"> / {data.total} pagaron</span>
          </span>
          <span className="text-xs text-muted-foreground">{Math.round(pct)}%</span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="mt-3 text-sm">
        <span className="font-semibold">{formatPesos(data.monto_cobrado)}</span>{' '}
        <span className="text-muted-foreground">cobrado</span>
        <div className="text-xs text-muted-foreground">
          de {formatPesos(data.monto_esperado)} esperado
        </div>
      </div>
    </div>
  )
}

function PendientesSection({ title, count, expanded, onToggle, children }) {
  return (
    <section className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold hover:bg-muted/50"
      >
        <span>
          {title} <span className="text-sm font-normal text-muted-foreground">({count})</span>
        </span>
        <span className="text-lg leading-none">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && <div className="border-t">{children}</div>}
    </section>
  )
}

function EmptyRow({ text }) {
  return <p className="px-4 py-3 text-sm text-muted-foreground">{text}</p>
}

function PagoButton({ persona_id, rol_tipo, rol_id, periodo_cubierto, nombre, onSuccess }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Registrar pago en efectivo
      </Button>
      {open && (
        <EfectivoRapidoModal
          persona_id={persona_id}
          rol_tipo={rol_tipo}
          rol_id={rol_id}
          periodo_cubierto={periodo_cubierto}
          nombre={nombre}
          onClose={() => setOpen(false)}
          onSuccess={() => {
            setOpen(false)
            onSuccess()
          }}
        />
      )}
    </>
  )
}

function EfectivoRapidoModal({
  persona_id,
  rol_tipo,
  rol_id,
  periodo_cubierto,
  nombre,
  onClose,
  onSuccess
}) {
  const today = useMemo(() => {
    const d = new Date()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${day}`
  }, [])

  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(today)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const montoNum = Number(monto)
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      setError('El monto debe ser mayor a 0')
      return
    }
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      setError('Fecha inválida')
      return
    }
    setSubmitting(true)
    try {
      const res = await window.api.pagos.create({
        persona_id,
        rol_tipo,
        rol_id,
        monto: montoNum,
        fecha_pago: fecha,
        periodo_cubierto
      })
      if (!res.ok) {
        setError(res.error.message)
        setSubmitting(false)
        return
      }
      onSuccess()
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md max-h-[90vh] space-y-4 overflow-y-auto rounded-lg border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold">Registrar pago en efectivo</h2>
        <p className="text-sm text-muted-foreground">{nombre}</p>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Monto<span className="text-destructive"> *</span>
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            className={`${fieldClass} w-full`}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            autoFocus
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Fecha<span className="text-destructive"> *</span>
          </span>
          <input
            type="date"
            className={`${fieldClass} w-full`}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </label>

        {error && (
          <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Confirmar'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function SimpleRow({
  nombre,
  monto,
  monto_cobrado,
  saldo,
  persona_id,
  rol_tipo,
  rol_id,
  periodo_cubierto,
  onSuccess
}) {
  const showParcial = monto_cobrado > 0
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{nombre}</div>
        {showParcial && (
          <div className="text-xs text-muted-foreground">
            pagó {formatPesos(monto_cobrado)} · debe {formatPesos(saldo)}
          </div>
        )}
      </div>
      <div className="text-sm font-semibold">{formatPesos(monto)}</div>
      <PagoButton
        persona_id={persona_id}
        rol_tipo={rol_tipo}
        rol_id={rol_id}
        periodo_cubierto={periodo_cubierto}
        nombre={nombre}
        onSuccess={onSuccess}
      />
    </li>
  )
}

function AlumnoGrupalRow({ alumno, periodo_cubierto, onSuccess }) {
  const total = alumno.grupos.reduce((s, g) => s + g.monto_mes, 0)
  const showParcial = alumno.monto_cobrado > 0
  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{fullName(alumno)}</div>
          {showParcial && (
            <div className="text-xs text-muted-foreground">
              pagó {formatPesos(alumno.monto_cobrado)} · debe {formatPesos(alumno.saldo)}
            </div>
          )}
        </div>
        <div className="text-sm font-semibold">{formatPesos(total)}</div>
        <PagoButton
          persona_id={alumno.persona_id}
          rol_tipo="alumno"
          rol_id={alumno.alumno_id}
          periodo_cubierto={periodo_cubierto}
          nombre={fullName(alumno)}
          onSuccess={onSuccess}
        />
      </div>
      <ul className="mt-2 ml-4 space-y-1 text-xs text-muted-foreground">
        {alumno.grupos.map((g) => (
          <li key={g.grupo_id} className="flex justify-between gap-2">
            <span className="truncate">{g.titulo}</span>
            <span className="shrink-0">{formatPesos(g.monto_mes)}</span>
          </li>
        ))}
      </ul>
    </li>
  )
}

export default Inicio
