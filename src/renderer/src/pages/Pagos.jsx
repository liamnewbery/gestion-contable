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

const MESES_CORTOS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic'
]

const TIPO_DISPLAY = {
  paciente: 'Paciente',
  alumno_particular: 'Alumno particular'
}

function tipoLabelFor(pago) {
  if (!pago.rol_tipo) return '—'
  if (pago.rol_tipo === 'alumno') {
    if (pago.grupo_titulos && !pago.grupo_titulos.includes(',')) {
      return `Alumno · ${pago.grupo_titulos}`
    }
    return 'Alumno grupal'
  }
  return TIPO_DISPLAY[pago.rol_tipo] ?? '—'
}

const ORIGEN_DISPLAY = {
  ia: 'IA',
  efectivo: 'Efectivo',
  manual: 'Manual'
}

const ESTADO_BADGE = {
  confirmado: 'bg-green-500/15 text-green-700 dark:text-green-400',
  revision: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-500',
  rechazado: 'bg-destructive/10 text-destructive'
}

const ESTADO_LABEL = {
  confirmado: 'Confirmado',
  revision: 'En revisión',
  rechazado: 'Rechazado'
}

const ORIGEN_BADGE = {
  ia: 'bg-primary/10 text-primary',
  efectivo: 'bg-secondary text-secondary-foreground',
  manual: 'bg-muted text-muted-foreground'
}

const fieldClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function pad2(n) {
  return String(n).padStart(2, '0')
}

function periodoString(anio, mes) {
  return `${anio}-${pad2(mes)}`
}

function formatFecha(yyyy_mm_dd) {
  if (!yyyy_mm_dd) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(yyyy_mm_dd)
  if (!m) return yyyy_mm_dd
  return `${m[3]}/${m[2]}/${m[1]}`
}

function formatMonto(n) {
  if (n == null) return ''
  return `$ ${Number(n).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`
}

function formatPeriodoCorto(yyyy_mm) {
  if (!yyyy_mm) return ''
  const m = /^(\d{4})-(\d{2})$/.exec(yyyy_mm)
  if (!m) return yyyy_mm
  return `${MESES_CORTOS[parseInt(m[2], 10) - 1]} ${m[1]}`
}

function formatMailDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function formatConfianza(n) {
  if (n == null) return '—'
  return `${Math.round(Number(n) * 100)}%`
}

function getYearOptions(currentYear) {
  const arr = []
  for (let y = currentYear; y >= currentYear - 5; y--) arr.push(y)
  return arr
}

function buildPersonasFromLists(pacientesRows, alumnosRows, alumnosParticularesRows) {
  const map = new Map()
  const ensure = (id, nombre, apellido) => {
    if (!map.has(id)) {
      map.set(id, {
        persona_id: id,
        nombre,
        apellido,
        paciente_id: null,
        alumno_id: null,
        alumno_particular_id: null
      })
    }
    return map.get(id)
  }
  for (const p of pacientesRows) {
    ensure(p.persona_id, p.nombre, p.apellido).paciente_id = p.paciente_id
  }
  for (const a of alumnosRows) {
    if (a.alumno_id == null) continue
    const e = ensure(a.persona_id, a.nombre, a.apellido)
    if (e.alumno_id == null) e.alumno_id = a.alumno_id
    if (a.grupo_id != null && a.grupo_titulo != null) {
      if (!e.grupos) e.grupos = []
      e.grupos.push({ grupo_id: a.grupo_id, titulo: a.grupo_titulo })
    }
  }
  for (const ap of alumnosParticularesRows) {
    ensure(ap.persona_id, ap.nombre, ap.apellido).alumno_particular_id = ap.alumno_particular_id
  }
  return Array.from(map.values()).sort((a, b) => {
    const ap = (a.apellido || '').localeCompare(b.apellido || '')
    if (ap !== 0) return ap
    return (a.nombre || '').localeCompare(b.nombre || '')
  })
}

function rolesDisponibles(persona) {
  if (!persona) return []
  const out = []
  if (persona.paciente_id != null)
    out.push({ rol_tipo: 'paciente', rol_id: persona.paciente_id, label: 'Sesión' })
  if (persona.alumno_id != null && persona.grupos && persona.grupos.length > 0)
    out.push({ rol_tipo: 'alumno', rol_id: persona.alumno_id, label: 'Clases grupales' })
  if (persona.alumno_particular_id != null)
    out.push({
      rol_tipo: 'alumno_particular',
      rol_id: persona.alumno_particular_id,
      label: 'Clase particular'
    })
  return out
}

function Field({ label, children, required }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      {children}
    </label>
  )
}

function Modal({ children, onClose, wide }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto rounded-lg border bg-background p-6 shadow-lg`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function Badge({ children, variantClass }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variantClass}`}
    >
      {children}
    </span>
  )
}

function ConfirmModal({
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirmar',
  destructive = false
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-lg border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Pagos() {
  const now = useMemo(() => new Date(), [])
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const [anio, setAnio] = useState(currentYear)
  const [mes, setMes] = useState(currentMonth)
  const [pagos, setPagos] = useState([])
  const [pagosRevision, setPagosRevision] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingRevision, setLoadingRevision] = useState(true)
  const [pageError, setPageError] = useState(null)
  const [revisandoMails, setRevisandoMails] = useState(false)
  const [revisarFeedback, setRevisarFeedback] = useState(null)
  const [tab, setTab] = useState('historial')

  const [resolverState, setResolverState] = useState({ open: false, pago: null })
  const [efectivoOpen, setEfectivoOpen] = useState(false)

  const [personasOptions, setPersonasOptions] = useState(null)
  const [personasLoading, setPersonasLoading] = useState(false)
  const [personasError, setPersonasError] = useState(null)

  const isCurrentYear = anio === currentYear
  const maxMes = isCurrentYear ? currentMonth : 12
  const yearOptions = useMemo(() => getYearOptions(currentYear), [currentYear])
  const periodoActual = periodoString(anio, mes)

  function handleAnioChange(newAnio) {
    setAnio(newAnio)
    if (newAnio === currentYear && mes > currentMonth) {
      setMes(currentMonth)
    }
  }

  async function loadPagos() {
    setLoading(true)
    setPageError(null)
    try {
      const res = await window.api.pagos.list(anio, mes)
      if (!res.ok) {
        setPageError(res.error.message)
        setPagos([])
        return
      }
      setPagos(res.data)
    } catch (err) {
      setPageError(err.message)
      setPagos([])
    } finally {
      setLoading(false)
    }
  }

  async function loadPagosRevision() {
    setLoadingRevision(true)
    try {
      const res = await window.api.pagos.listRevision()
      if (!res.ok) {
        setPagosRevision([])
        return
      }
      setPagosRevision(res.data)
    } catch {
      setPagosRevision([])
    } finally {
      setLoadingRevision(false)
    }
  }

  async function loadAllPagos() {
    await Promise.all([loadPagos(), loadPagosRevision()])
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPagos()
  }, [anio, mes]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPagosRevision()
  }, [])

  async function loadPersonas() {
    setPersonasLoading(true)
    setPersonasError(null)
    try {
      const [pac, alu, ap] = await Promise.all([
        window.api.pacientes.list(),
        window.api.alumnos.list(),
        window.api.alumnos_particulares.list()
      ])
      if (!pac.ok) throw new Error(pac.error.message)
      if (!alu.ok) throw new Error(alu.error.message)
      if (!ap.ok) throw new Error(ap.error.message)
      setPersonasOptions(buildPersonasFromLists(pac.data, alu.data, ap.data))
    } catch (err) {
      setPersonasError(err.message)
      setPersonasOptions([])
    } finally {
      setPersonasLoading(false)
    }
  }

  function openResolver(pago) {
    setResolverState({ open: true, pago })
    loadPersonas()
  }

  function closeResolver() {
    setResolverState({ open: false, pago: null })
  }

  function openEfectivo() {
    setEfectivoOpen(true)
    loadPersonas()
  }

  function closeEfectivo() {
    setEfectivoOpen(false)
  }

  async function handleAbrirComprobante(archivo_path) {
    const res = await window.api.pagos.abrirComprobante(archivo_path)
    if (!res.ok) setPageError(res.error.message)
  }

  async function handleCambiarEstado(pago, nuevoEstado) {
    const res = await window.api.pagos.update({
      id: pago.id,
      persona_id: pago.persona_id,
      rol_tipo: pago.rol_tipo,
      rol_id: pago.rol_id,
      estado: nuevoEstado
    })
    if (!res.ok) {
      setPageError(res.error.message)
      return
    }
    await loadAllPagos()
  }

  async function handleResolverConfirmar(persona_id, rol_tipo, rol_id) {
    const res = await window.api.pagos.update({
      id: resolverState.pago.id,
      persona_id,
      rol_tipo,
      rol_id,
      estado: 'confirmado'
    })
    if (!res.ok) {
      return res.error.message
    }
    closeResolver()
    await loadAllPagos()
    return null
  }

  async function handleResolverRechazar() {
    const res = await window.api.pagos.update({
      id: resolverState.pago.id,
      persona_id: resolverState.pago.persona_id,
      rol_tipo: resolverState.pago.rol_tipo,
      rol_id: resolverState.pago.rol_id,
      estado: 'rechazado'
    })
    if (!res.ok) {
      return res.error.message
    }
    closeResolver()
    await loadAllPagos()
    return null
  }

  async function handleRegistrarEfectivo(payload) {
    const res = await window.api.pagos.create(payload)
    if (!res.ok) return res.error.message
    closeEfectivo()
    await loadAllPagos()
    return null
  }

  async function handleRevisarMails() {
    setRevisandoMails(true)
    setRevisarFeedback(null)
    setPageError(null)
    try {
      const res = await window.api.mail.revisarAhora()
      if (!res.ok) {
        setPageError(res.error.message)
        return
      }
      const { procesados, errores } = res.data
      const partes = [`Procesados: ${procesados}`]
      if (errores.length > 0) partes.push(`con ${errores.length} error(es)`)
      setRevisarFeedback(partes.join(' '))
      await loadAllPagos()
    } catch (err) {
      setPageError(err.message)
    } finally {
      setRevisandoMails(false)
    }
  }

  const filasHistorial = pagos.filter((p) => p.estado !== 'revision')
  const filasRevision = pagosRevision
  const filas = tab === 'historial' ? filasHistorial : filasRevision
  const cargandoTab = tab === 'historial' ? loading : loadingRevision

  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-4xl font-bold">Pagos</h1>
        {tab === 'historial' && (
          <div className="flex items-center gap-2">
            <select
              className={`${fieldClass} w-auto`}
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
              className={`${fieldClass} w-auto`}
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
        )}
      </div>

      <div className="mb-6 inline-flex items-center gap-1 rounded-xl border bg-muted/40 p-1.5">
        <button
          type="button"
          onClick={() => setTab('historial')}
          className={`rounded-lg px-6 py-2.5 text-base font-semibold transition-all ${
            tab === 'historial'
              ? 'bg-primary text-primary-foreground shadow'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Historial de pagos
        </button>
        <button
          type="button"
          onClick={() => setTab('revisar')}
          className={`flex items-center gap-2 rounded-lg px-6 py-2.5 text-base font-semibold transition-all ${
            tab === 'revisar'
              ? 'bg-primary text-primary-foreground shadow'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Pagos a revisar
          {pagosRevision.length > 0 && (
            <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-destructive px-2 text-sm font-bold text-white">
              {pagosRevision.length}
            </span>
          )}
        </button>
      </div>

      {tab === 'historial' && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button onClick={openEfectivo} className="bg-green-600 hover:bg-green-700 text-white">
            + Registrar pago en efectivo
          </Button>
          <Button variant="outline" onClick={handleRevisarMails} disabled={revisandoMails}>
            {revisandoMails ? 'Revisando…' : 'Revisar si llegaron nuevos comprobantes'}
          </Button>
          {revisarFeedback && (
            <span className="text-sm text-muted-foreground">{revisarFeedback}</span>
          )}
        </div>
      )}

      {pageError && (
        <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {pageError}
        </div>
      )}

      {cargandoTab ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="text-muted-foreground">
          {tab === 'historial'
            ? `No hay pagos en ${MESES[mes - 1]} ${anio}.`
            : 'No hay pagos pendientes de revisión.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Persona</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2 text-right">Monto</th>
                <th className="px-3 py-2">Origen</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => (
                <PagoRow
                  key={p.id}
                  pago={p}
                  periodoActual={periodoActual}
                  onAbrir={handleAbrirComprobante}
                  onCambiarEstado={handleCambiarEstado}
                  onResolver={openResolver}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resolverState.open && (
        <Modal onClose={closeResolver} wide>
          <ResolverModal
            pago={resolverState.pago}
            personas={personasOptions}
            personasLoading={personasLoading}
            personasError={personasError}
            onConfirmar={handleResolverConfirmar}
            onRechazar={handleResolverRechazar}
            onAbrirComprobante={handleAbrirComprobante}
            onCancelar={closeResolver}
          />
        </Modal>
      )}

      {efectivoOpen && (
        <Modal onClose={closeEfectivo}>
          <EfectivoModal
            personas={personasOptions}
            personasLoading={personasLoading}
            personasError={personasError}
            currentYear={currentYear}
            currentMonth={currentMonth}
            onRegistrar={handleRegistrarEfectivo}
            onCancelar={closeEfectivo}
          />
        </Modal>
      )}
    </div>
  )
}

function PagoRow({ pago, periodoActual, onAbrir, onCambiarEstado, onResolver }) {
  const [confirmingRechazo, setConfirmingRechazo] = useState(false)
  const sinAsignar = pago.persona_id == null
  const tipoLabel = tipoLabelFor(pago)
  const periodoDistinto =
    pago.estado === 'revision' && pago.periodo_cubierto && pago.periodo_cubierto !== periodoActual

  return (
    <tr className="border-b align-top hover:bg-muted/40">
      <td className="px-3 py-2 whitespace-nowrap">{formatFecha(pago.fecha_pago)}</td>
      <td className="px-3 py-2">
        {sinAsignar ? (
          <span className="italic text-muted-foreground">Sin asignar</span>
        ) : (
          `${pago.persona_nombre} ${pago.persona_apellido}`
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{tipoLabel}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap font-medium">
        {formatMonto(pago.monto)}
      </td>
      <td className="px-3 py-2">
        <Badge variantClass={ORIGEN_BADGE[pago.origen] || ORIGEN_BADGE.manual}>
          {ORIGEN_DISPLAY[pago.origen] || pago.origen}
        </Badge>
      </td>
      <td className="px-3 py-2">
        <Badge variantClass={ESTADO_BADGE[pago.estado] || ''}>
          {ESTADO_LABEL[pago.estado] || pago.estado}
        </Badge>
        {periodoDistinto && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {formatPeriodoCorto(pago.periodo_cubierto)}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col items-end gap-1">
          {pago.archivo_path && (
            <Button size="sm" variant="outline" onClick={() => onAbrir(pago.archivo_path)}>
              Ver comprobante
            </Button>
          )}
          {pago.estado === 'revision' && (
            <Button size="sm" onClick={() => onResolver(pago)}>
              Resolver
            </Button>
          )}
          {pago.estado === 'confirmado' && (
            <Button size="sm" variant="destructive" onClick={() => setConfirmingRechazo(true)}>
              Rechazar
            </Button>
          )}
          {pago.estado === 'rechazado' && (
            <Button size="sm" onClick={() => onCambiarEstado(pago, 'confirmado')}>
              Confirmar
            </Button>
          )}
          {confirmingRechazo && (
            <ConfirmModal
              title="Rechazar pago"
              message={`¿Seguro que querés rechazar el pago de ${formatMonto(pago.monto)} de ${pago.persona_nombre} ${pago.persona_apellido}? Va a salir de la contabilidad.`}
              confirmLabel="Rechazar"
              destructive
              onConfirm={() => {
                setConfirmingRechazo(false)
                onCambiarEstado(pago, 'rechazado')
              }}
              onCancel={() => setConfirmingRechazo(false)}
            />
          )}
        </div>
      </td>
    </tr>
  )
}

function ResolverModal({
  pago,
  personas,
  personasLoading,
  personasError,
  onConfirmar,
  onRechazar,
  onAbrirComprobante,
  onCancelar
}) {
  const [personaId, setPersonaId] = useState('')
  const [rolTipo, setRolTipo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [confirmingRechazo, setConfirmingRechazo] = useState(false)

  const personaSeleccionada = personas?.find((p) => p.persona_id === Number(personaId))
  const roles = rolesDisponibles(personaSeleccionada)

  // Si la persona seleccionada cambia y el rol actual ya no aplica, limpiarlo
  useEffect(() => {
    if (rolTipo && !roles.some((r) => r.rol_tipo === rolTipo)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRolTipo('')
    }
  }, [rolTipo, roles])

  async function handleConfirmar() {
    setError(null)
    if (!personaId || !rolTipo) {
      setError('Seleccioná una persona y un rol')
      return
    }
    const rolElegido = roles.find((r) => r.rol_tipo === rolTipo)
    if (!rolElegido) {
      setError('El rol seleccionado no está disponible para esa persona')
      return
    }
    setSubmitting(true)
    const errMsg = await onConfirmar(
      personaSeleccionada.persona_id,
      rolElegido.rol_tipo,
      rolElegido.rol_id
    )
    if (errMsg) {
      setError(errMsg)
      setSubmitting(false)
    }
  }

  async function handleRechazar() {
    setError(null)
    setSubmitting(true)
    const errMsg = await onRechazar()
    if (errMsg) {
      setError(errMsg)
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Resolver pago en revisión</h2>

      <section className="space-y-2 rounded-md bg-muted p-3 text-sm">
        <div>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Mail</span>
          <div>
            <span className="font-medium">{pago.mail_from || '—'}</span>{' '}
            <span className="text-muted-foreground">· {formatMailDate(pago.mail_date)}</span>
          </div>
          <div className="text-muted-foreground">{pago.mail_subject || '(sin asunto)'}</div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Monto</span>
            <div className="font-medium">{formatMonto(pago.monto)}</div>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Fecha</span>
            <div className="font-medium">{formatFecha(pago.fecha_pago)}</div>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Confianza IA
            </span>
            <div className="font-medium">{formatConfianza(pago.confianza_ia)}</div>
          </div>
        </div>
        {pago.archivo_path && (
          <div className="pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAbrirComprobante(pago.archivo_path)}
            >
              Ver comprobante
            </Button>
          </div>
        )}
      </section>

      {personasError && (
        <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
          {personasError}
        </div>
      )}

      <Field label="Persona" required>
        <select
          className={fieldClass}
          value={personaId}
          onChange={(e) => setPersonaId(e.target.value)}
          disabled={personasLoading}
        >
          <option value="">{personasLoading ? 'Cargando…' : 'Seleccioná una persona…'}</option>
          {(personas || []).map((p) => (
            <option key={p.persona_id} value={p.persona_id}>
              {p.apellido}, {p.nombre}
            </option>
          ))}
        </select>
      </Field>

      {personaSeleccionada && (
        <Field label="Rol" required>
          {roles.length === 0 ? (
            <div className="rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
              Esta persona no tiene roles activos
            </div>
          ) : (
            <select
              className={fieldClass}
              value={rolTipo}
              onChange={(e) => setRolTipo(e.target.value)}
            >
              <option value="">Seleccioná un rol…</option>
              {roles.map((r) => (
                <option key={r.rol_tipo} value={r.rol_tipo}>
                  {r.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>
      )}

      <div className="flex justify-between gap-2 pt-2">
        <Button
          variant="destructive"
          onClick={() => setConfirmingRechazo(true)}
          disabled={submitting}
        >
          Rechazar pago
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancelar} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={submitting || !personaId || !rolTipo || roles.length === 0}
          >
            {submitting ? 'Guardando…' : 'Confirmar asignación'}
          </Button>
        </div>
      </div>

      {confirmingRechazo && (
        <ConfirmModal
          title="Rechazar pago"
          message={`¿Seguro que querés rechazar este pago de ${formatMonto(pago.monto)}? No va a quedar registrado en la contabilidad.`}
          confirmLabel="Rechazar"
          destructive
          onConfirm={() => {
            setConfirmingRechazo(false)
            handleRechazar()
          }}
          onCancel={() => setConfirmingRechazo(false)}
        />
      )}
    </div>
  )
}

function EfectivoModal({
  personas,
  personasLoading,
  personasError,
  currentYear,
  currentMonth,
  onRegistrar,
  onCancelar
}) {
  const [personaId, setPersonaId] = useState('')
  const [rolTipo, setRolTipo] = useState('')
  const [monto, setMonto] = useState('')
  const [periodoAnio, setPeriodoAnio] = useState(currentYear)
  const [periodoMes, setPeriodoMes] = useState(currentMonth)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const personaSeleccionada = personas?.find((p) => p.persona_id === Number(personaId))
  const roles = rolesDisponibles(personaSeleccionada)

  const isCurrentYear = periodoAnio === currentYear
  const maxMes = isCurrentYear ? currentMonth : 12
  const yearOptions = useMemo(() => getYearOptions(currentYear), [currentYear])

  useEffect(() => {
    if (rolTipo && !roles.some((r) => r.rol_tipo === rolTipo)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRolTipo('')
    }
  }, [rolTipo, roles])

  function handlePeriodoAnioChange(newAnio) {
    setPeriodoAnio(newAnio)
    if (newAnio === currentYear && periodoMes > currentMonth) {
      setPeriodoMes(currentMonth)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!personaId || !rolTipo) {
      setError('Seleccioná una persona y un rol')
      return
    }
    const rolElegido = roles.find((r) => r.rol_tipo === rolTipo)
    if (!rolElegido) {
      setError('El rol seleccionado no está disponible')
      return
    }
    const montoNum = Number(monto)
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      setError('El monto debe ser mayor a 0')
      return
    }
    setSubmitting(true)
    const errMsg = await onRegistrar({
      persona_id: personaSeleccionada.persona_id,
      rol_tipo: rolElegido.rol_tipo,
      rol_id: rolElegido.rol_id,
      monto: montoNum,
      fecha_pago: `${periodoAnio}-${pad2(periodoMes)}-01`,
      periodo_cubierto: periodoString(periodoAnio, periodoMes)
    })
    if (errMsg) {
      setError(errMsg)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-semibold">Registrar pago en efectivo</h2>

      {personasError && (
        <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
          {personasError}
        </div>
      )}

      <Field label="Persona" required>
        <select
          className={fieldClass}
          value={personaId}
          onChange={(e) => setPersonaId(e.target.value)}
          disabled={personasLoading}
        >
          <option value="">{personasLoading ? 'Cargando…' : 'Seleccioná una persona…'}</option>
          {(personas || []).map((p) => (
            <option key={p.persona_id} value={p.persona_id}>
              {p.apellido}, {p.nombre}
            </option>
          ))}
        </select>
      </Field>

      {personaSeleccionada && (
        <Field label="Concepto" required>
          {roles.length === 0 ? (
            <div className="rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
              Esta persona no tiene roles activos
            </div>
          ) : (
            <select
              className={fieldClass}
              value={rolTipo}
              onChange={(e) => setRolTipo(e.target.value)}
            >
              <option value="">Seleccioná un concepto…</option>
              {roles.map((r) => (
                <option key={r.rol_tipo} value={r.rol_tipo}>
                  {r.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}

      <Field label="Monto" required>
        <input
          type="number"
          min="0"
          step="0.01"
          className={fieldClass}
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
      </Field>

      <div>
        <span className="mb-1 block text-sm font-medium">¿A qué mes corresponde este pago?</span>
        <div className="flex gap-2">
          <select
            className={fieldClass}
            value={periodoMes}
            onChange={(e) => setPeriodoMes(Number(e.target.value))}
          >
            {MESES.map((nombre, i) => (
              <option key={i} value={i + 1} disabled={i + 1 > maxMes}>
                {nombre}
              </option>
            ))}
          </select>
          <select
            className={fieldClass}
            value={periodoAnio}
            onChange={(e) => handlePeriodoAnioChange(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancelar} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting || roles.length === 0}>
          {submitting ? 'Registrando…' : 'Registrar'}
        </Button>
      </div>
    </form>
  )
}

export default Pagos
