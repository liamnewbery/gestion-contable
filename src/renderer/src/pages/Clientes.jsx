import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'

const FRECUENCIA_OPTIONS = [
  { value: '', label: '—' },
  { value: 'mensual', label: 'Mensual' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' }
]

const FRECUENCIA_DISPLAY = {
  mensual: 'mensual',
  semanal: 'semanal',
  quincenal: 'quincenal'
}

const TIPO_CLASE_OPTIONS = [
  { value: 'tarot', label: 'Tarot' },
  { value: 'astrologia', label: 'Astrología' },
  { value: 'filosofia', label: 'Filosofía' }
]

const TIPO_CLASE_DISPLAY = {
  tarot: 'Tarot',
  astrologia: 'Astrología',
  filosofia: 'Filosofía'
}

const fieldClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

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

function formatPrecio(value) {
  if (value == null) return null
  return `$${Number(value).toLocaleString('es-AR')}`
}

function formatPrecioFrecuencia(precio, frecuencia) {
  const p = formatPrecio(precio)
  if (!p) return frecuencia ? FRECUENCIA_DISPLAY[frecuencia] : 'Sin precio'
  return frecuencia ? `${p} · ${FRECUENCIA_DISPLAY[frecuencia]}` : p
}

const initialPacienteForm = {
  precio_base: '',
  frecuencia_pago: '',
  precio_es_especial: false
}

const initialAlumnoForm = {
  grupos: []
}

const initialAlumnoParticularForm = {
  tipo_clase: 'tarot',
  precio_base: '',
  frecuencia_pago: '',
  precio_es_especial: false
}

const initialFormData = {
  editing: null,
  nombre: '',
  apellido: '',
  dni: '',
  email: '',
  esPaciente: false,
  paciente: { ...initialPacienteForm },
  esAlumno: false,
  alumno: { ...initialAlumnoForm },
  esAlumnoParticular: false,
  alumnoParticular: { ...initialAlumnoParticularForm }
}

function buildClientes(pacientes, alumnos, alumnosParticulares) {
  const map = new Map()
  const ensure = (row) => {
    if (!map.has(row.persona_id)) {
      map.set(row.persona_id, {
        persona_id: row.persona_id,
        nombre: row.nombre,
        apellido: row.apellido,
        dni: row.dni,
        email: row.email,
        paciente: null,
        alumno: null,
        alumnoParticular: null,
        grupos: []
      })
    }
    return map.get(row.persona_id)
  }

  for (const p of pacientes) {
    const c = ensure(p)
    c.paciente = {
      paciente_id: p.paciente_id,
      precio_base: p.precio_base,
      frecuencia_pago: p.frecuencia_pago,
      precio_es_especial: !!p.precio_es_especial
    }
  }

  for (const a of alumnos) {
    const c = ensure(a)
    if (!c.alumno) {
      c.alumno = { alumno_id: a.alumno_id }
    }
    if (a.grupo_id) {
      c.grupos.push({
        alumno_grupo_id: a.alumno_grupo_id,
        grupo_id: a.grupo_id,
        grupo_titulo: a.grupo_titulo,
        grupo_tipo_clase: a.grupo_tipo_clase,
        grupo_precio_base: a.grupo_precio_base,
        grupo_frecuencia_pago: a.grupo_frecuencia_pago,
        precio_override: a.precio_override,
        precio_grupo_es_especial: !!a.precio_grupo_es_especial
      })
    }
  }

  for (const ap of alumnosParticulares) {
    const c = ensure(ap)
    c.alumnoParticular = {
      alumno_particular_id: ap.alumno_particular_id,
      tipo_clase: ap.tipo_clase,
      precio_base: ap.precio_base,
      frecuencia_pago: ap.frecuencia_pago,
      precio_es_especial: !!ap.precio_es_especial
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const ap = (a.apellido || '').localeCompare(b.apellido || '')
    if (ap !== 0) return ap
    return (a.nombre || '').localeCompare(b.nombre || '')
  })
}

function Clientes() {
  const [vista, setVista] = useState('activos')
  const [filtro, setFiltro] = useState('todos')
  const [pacientes, setPacientes] = useState([])
  const [alumnos, setAlumnos] = useState([])
  const [alumnosParticulares, setAlumnosParticulares] = useState([])
  const [grupos, setGrupos] = useState([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState(null)

  const [formOpen, setFormOpen] = useState(false)
  const [formData, setFormData] = useState(initialFormData)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)

  const [confirmTarget, setConfirmTarget] = useState(null)
  const [deactivating, setDeactivating] = useState(false)

  async function loadAll(targetVista) {
    setLoading(true)
    setPageError(null)
    try {
      const [pacRes, alumRes, apRes, grpRes] = await Promise.all([
        targetVista === 'activos'
          ? window.api.pacientes.list()
          : window.api.pacientes.listInactivos(),
        targetVista === 'activos'
          ? window.api.alumnos.list()
          : window.api.alumnos.listInactivos(),
        targetVista === 'activos'
          ? window.api.alumnos_particulares.list()
          : window.api.alumnos_particulares.listInactivos(),
        window.api.grupos.list()
      ])
      if (!pacRes.ok) throw new Error(pacRes.error.message)
      if (!alumRes.ok) throw new Error(alumRes.error.message)
      if (!apRes.ok) throw new Error(apRes.error.message)
      if (!grpRes.ok) throw new Error(grpRes.error.message)
      setPacientes(pacRes.data)
      setAlumnos(alumRes.data)
      setAlumnosParticulares(apRes.data)
      setGrupos(grpRes.data)
    } catch (err) {
      setPageError(err.message)
      setPacientes([])
      setAlumnos([])
      setAlumnosParticulares([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll(vista)
  }, [vista])

  const clientes = useMemo(
    () => buildClientes(pacientes, alumnos, alumnosParticulares),
    [pacientes, alumnos, alumnosParticulares]
  )

  const filtered = useMemo(() => {
    switch (filtro) {
      case 'pacientes':
        return clientes.filter((c) => c.paciente)
      case 'alumnos':
        return clientes.filter((c) => c.alumno || c.alumnoParticular)
      case 'ambos':
        return clientes.filter(
          (c) => c.paciente && (c.alumno || c.alumnoParticular)
        )
      case 'especial':
        return clientes.filter(
          (c) =>
            (c.paciente && c.paciente.precio_es_especial) ||
            (c.alumnoParticular && c.alumnoParticular.precio_es_especial) ||
            c.grupos.some((g) => g.precio_grupo_es_especial)
        )
      default:
        return clientes
    }
  }, [clientes, filtro])

  function openCreate() {
    setFormData(initialFormData)
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(client) {
    setFormData({
      editing: {
        persona_id: client.persona_id,
        paciente_id: client.paciente?.paciente_id ?? null,
        alumno_id: client.alumno?.alumno_id ?? null,
        alumno_particular_id: client.alumnoParticular?.alumno_particular_id ?? null
      },
      nombre: client.nombre || '',
      apellido: client.apellido || '',
      dni: client.dni || '',
      email: client.email || '',
      esPaciente: !!client.paciente,
      paciente: client.paciente
        ? {
            precio_base: client.paciente.precio_base ?? '',
            frecuencia_pago: client.paciente.frecuencia_pago ?? '',
            precio_es_especial: !!client.paciente.precio_es_especial
          }
        : { ...initialPacienteForm },
      esAlumno: !!client.alumno,
      alumno: client.alumno
        ? {
            grupos: client.grupos.map((g) => ({
              grupo_id: g.grupo_id,
              precio_override: g.precio_override ?? '',
              precio_es_especial: !!g.precio_grupo_es_especial
            }))
          }
        : { ...initialAlumnoForm },
      esAlumnoParticular: !!client.alumnoParticular,
      alumnoParticular: client.alumnoParticular
        ? {
            tipo_clase: client.alumnoParticular.tipo_clase,
            precio_base: client.alumnoParticular.precio_base ?? '',
            frecuencia_pago: client.alumnoParticular.frecuencia_pago ?? '',
            precio_es_especial: !!client.alumnoParticular.precio_es_especial
          }
        : { ...initialAlumnoParticularForm }
    })
    setFormError(null)
    setFormOpen(true)
  }

  function closeForm() {
    if (submitting) return
    setFormOpen(false)
  }

  function isEditingMode() {
    return formData.editing !== null
  }

  // Build personFields used by every payload
  function personPayload() {
    return {
      nombre: formData.nombre.trim(),
      apellido: formData.apellido.trim(),
      dni: formData.dni.trim() || null,
      email: formData.email.trim() || null
    }
  }

  function pacientePayload() {
    return {
      precio_base: formData.paciente.precio_base,
      frecuencia_pago: formData.paciente.frecuencia_pago || null,
      precio_es_especial: formData.paciente.precio_es_especial ? 1 : 0
    }
  }

  function alumnoPayload() {
    return {
      grupos: formData.alumno.grupos.map((g) => ({
        grupo_id: g.grupo_id,
        precio_override: g.precio_override === '' ? null : Number(g.precio_override),
        precio_es_especial: g.precio_es_especial ? 1 : 0
      }))
    }
  }

  function alumnoParticularPayload() {
    return {
      tipo_clase: formData.alumnoParticular.tipo_clase,
      precio_base: formData.alumnoParticular.precio_base,
      frecuencia_pago: formData.alumnoParticular.frecuencia_pago || null,
      precio_es_especial: formData.alumnoParticular.precio_es_especial ? 1 : 0
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)

    if (!formData.nombre.trim() || !formData.apellido.trim()) {
      setFormError('Nombre y apellido son obligatorios.')
      return
    }
    if (!formData.esPaciente && !formData.esAlumno && !formData.esAlumnoParticular) {
      setFormError('Marcá al menos un rol.')
      return
    }
    if (formData.esAlumno && formData.alumno.grupos.length === 0) {
      setFormError('Debés seleccionar al menos un grupo.')
      return
    }

    setSubmitting(true)
    try {
      if (!isEditingMode()) {
        // CREATE
        let persona_id = null

        if (formData.esPaciente) {
          const res = await window.api.pacientes.create({
            ...personPayload(),
            ...pacientePayload()
          })
          if (!res.ok) {
            setFormError(res.error.message)
            return
          }
          persona_id = res.data.persona_id
        }

        if (formData.esAlumnoParticular) {
          const res = await window.api.alumnos_particulares.create({
            persona_id,
            ...personPayload(),
            ...alumnoParticularPayload()
          })
          if (!res.ok) {
            setFormError(res.error.message)
            return
          }
          if (!persona_id && res.data) persona_id = res.data.persona_id
        }

        if (formData.esAlumno) {
          const res = await window.api.alumnos.create({
            persona_id,
            ...personPayload(),
            ...alumnoPayload()
          })
          if (!res.ok) {
            setFormError(res.error.message)
            return
          }
        }
      } else {
        // EDIT
        const editing = formData.editing
        const wasPaciente = editing.paciente_id !== null
        const wasAlumno = editing.alumno_id !== null
        const wasAlumnoParticular = editing.alumno_particular_id !== null

        // 1. Update existing roles (this also syncs persona data)
        if (wasPaciente) {
          const res = await window.api.pacientes.update({
            paciente_id: editing.paciente_id,
            persona_id: editing.persona_id,
            ...personPayload(),
            ...pacientePayload()
          })
          if (!res.ok) {
            setFormError(res.error.message)
            return
          }
        }
        if (wasAlumno) {
          const res = await window.api.alumnos.update({
            alumno_id: editing.alumno_id,
            persona_id: editing.persona_id,
            ...personPayload(),
            ...alumnoPayload()
          })
          if (!res.ok) {
            setFormError(res.error.message)
            return
          }
        }
        if (wasAlumnoParticular) {
          const res = await window.api.alumnos_particulares.update({
            alumno_particular_id: editing.alumno_particular_id,
            persona_id: editing.persona_id,
            ...personPayload(),
            ...alumnoParticularPayload()
          })
          if (!res.ok) {
            setFormError(res.error.message)
            return
          }
        }

        // 2. Deactivate roles that were removed
        if (wasPaciente && !formData.esPaciente) {
          const res = await window.api.pacientes.deactivate(editing.paciente_id)
          if (!res.ok) {
            setFormError(res.error.message)
            return
          }
        }
        if (wasAlumno && !formData.esAlumno) {
          const res = await window.api.alumnos.deactivate(editing.alumno_id)
          if (!res.ok) {
            setFormError(res.error.message)
            return
          }
        }
        if (wasAlumnoParticular && !formData.esAlumnoParticular) {
          const res = await window.api.alumnos_particulares.deactivate(
            editing.alumno_particular_id
          )
          if (!res.ok) {
            setFormError(res.error.message)
            return
          }
        }

        // 3. Add roles that didn't exist (use existing persona_id, no new persona)
        if (!wasPaciente && formData.esPaciente) {
          const res = await window.api.pacientes.create({
            persona_id: editing.persona_id,
            ...personPayload(),
            ...pacientePayload()
          })
          if (!res.ok) {
            setFormError(res.error.message)
            return
          }
        }
        if (!wasAlumno && formData.esAlumno) {
          const res = await window.api.alumnos.create({
            persona_id: editing.persona_id,
            ...personPayload(),
            ...alumnoPayload()
          })
          if (!res.ok) {
            setFormError(res.error.message)
            return
          }
        }
        if (!wasAlumnoParticular && formData.esAlumnoParticular) {
          const res = await window.api.alumnos_particulares.create({
            persona_id: editing.persona_id,
            ...personPayload(),
            ...alumnoParticularPayload()
          })
          if (!res.ok) {
            setFormError(res.error.message)
            return
          }
        }
      }

      setFormOpen(false)
      await loadAll(vista)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openDeactivate(client, role) {
    setConfirmTarget({
      role,
      persona_id: client.persona_id,
      nombre: client.nombre,
      apellido: client.apellido,
      paciente_id: client.paciente?.paciente_id ?? null,
      alumno_id: client.alumno?.alumno_id ?? null,
      alumno_particular_id: client.alumnoParticular?.alumno_particular_id ?? null
    })
  }

  function closeConfirm() {
    if (deactivating) return
    setConfirmTarget(null)
  }

  async function handleConfirmDeactivate() {
    setDeactivating(true)
    try {
      let res
      if (confirmTarget.role === 'paciente') {
        res = await window.api.pacientes.deactivate(confirmTarget.paciente_id)
      } else if (confirmTarget.role === 'alumno') {
        res = await window.api.alumnos.deactivate(confirmTarget.alumno_id)
      } else {
        res = await window.api.alumnos_particulares.deactivate(
          confirmTarget.alumno_particular_id
        )
      }
      if (!res.ok) {
        setPageError(res.error.message)
        setConfirmTarget(null)
        return
      }
      setConfirmTarget(null)
      await loadAll(vista)
    } catch (err) {
      setPageError(err.message)
      setConfirmTarget(null)
    } finally {
      setDeactivating(false)
    }
  }

  function toggleGrupo(grupo) {
    const current = formData.alumno.grupos
    const idx = current.findIndex((g) => g.grupo_id === grupo.id)
    let next
    if (idx >= 0) {
      next = [...current.slice(0, idx), ...current.slice(idx + 1)]
    } else {
      next = [
        ...current,
        { grupo_id: grupo.id, precio_override: '', precio_es_especial: false }
      ]
    }
    setFormData({ ...formData, alumno: { ...formData.alumno, grupos: next } })
  }

  function updateGrupoField(grupo_id, field, value) {
    const next = formData.alumno.grupos.map((g) => {
      if (g.grupo_id !== grupo_id) return g
      const updated = { ...g, [field]: value }
      if (field === 'precio_es_especial' && !value) {
        updated.precio_override = ''
      }
      return updated
    })
    setFormData({ ...formData, alumno: { ...formData.alumno, grupos: next } })
  }

  const filterTabs = [
    { value: 'todos', label: 'Todos' },
    { value: 'pacientes', label: 'Pacientes' },
    { value: 'alumnos', label: 'Alumnos' },
    { value: 'ambos', label: 'Personas que son alumnos y pacientes al mismo tiempo' },
    { value: 'especial', label: 'Personas con precio especial' }
  ]

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-4xl font-bold">
          {vista === 'activos' ? 'Clientes' : 'Clientes inactivos'}
        </h1>
        {vista === 'activos' ? (
          <Button
            onClick={openCreate}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            + Añadir cliente
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setVista('activos')}>
            ← Volver a clientes activos
          </Button>
        )}
      </div>

      {vista === 'activos' && (
        <div className="mb-4 flex flex-wrap gap-2">
          {filterTabs.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setFiltro(t.value)}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                filtro === t.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background hover:bg-muted'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {pageError && (
        <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {pageError}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : filtered.length === 0 ? (
        <EmptyState vista={vista} filtro={filtro} />
      ) : (
        <ul className="space-y-3">
          {filtered.map((c) => (
            <ClientCard
              key={c.persona_id}
              client={c}
              vista={vista}
              onEdit={() => openEdit(c)}
              onDeactivate={(role) => openDeactivate(c, role)}
            />
          ))}
        </ul>
      )}

      {vista === 'activos' && (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setVista('inactivos')}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Ver clientes dados de baja
          </button>
        </div>
      )}

      {formOpen && (
        <Modal onClose={closeForm} wide>
          <ClientForm
            formData={formData}
            setFormData={setFormData}
            grupos={grupos}
            onToggleGrupo={toggleGrupo}
            onUpdateGrupoField={updateGrupoField}
            onSubmit={handleSubmit}
            onCancel={closeForm}
            submitting={submitting}
            error={formError}
          />
        </Modal>
      )}

      {confirmTarget && (
        <Modal onClose={closeConfirm}>
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Dar de baja</h2>
            <p className="text-sm">
              ¿Seguro que querés dar de baja a{' '}
              <span className="font-semibold">
                {confirmTarget.nombre} {confirmTarget.apellido}
              </span>{' '}
              como{' '}
              <span className="font-semibold">
                {confirmTarget.role === 'paciente'
                  ? 'paciente'
                  : confirmTarget.role === 'alumno'
                    ? 'alumno'
                    : 'alumno particular'}
              </span>
              ?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeConfirm} disabled={deactivating}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDeactivate}
                disabled={deactivating}
              >
                {deactivating ? 'Dando de baja…' : 'Sí, dar de baja'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function EmptyState({ vista, filtro }) {
  let msg = ''
  if (vista === 'inactivos') {
    msg = 'No hay clientes inactivos.'
  } else if (filtro === 'pacientes') {
    msg = 'No hay pacientes.'
  } else if (filtro === 'alumnos') {
    msg = 'No hay alumnos.'
  } else if (filtro === 'ambos') {
    msg = 'No hay personas que sean alumnos y pacientes al mismo tiempo.'
  } else if (filtro === 'especial') {
    msg = 'No hay personas con precio especial.'
  } else {
    msg = 'Todavía no hay clientes. Creá el primero con el botón “Añadir cliente”.'
  }
  return <p className="text-muted-foreground">{msg}</p>
}

function RoleBadge({ children, variant = 'default' }) {
  const tones = {
    default: 'bg-muted text-foreground',
    paciente: 'bg-primary/10 text-primary',
    alumno: 'bg-primary/10 text-primary',
    grupo: 'bg-primary/10 text-primary',
    especial: 'bg-destructive/10 text-destructive'
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[variant]}`}
    >
      {children}
    </span>
  )
}

function ClientCard({ client, vista, onEdit, onDeactivate }) {
  const activeRoles = []
  if (client.paciente) activeRoles.push({ key: 'paciente', label: 'paciente' })
  if (client.alumno) activeRoles.push({ key: 'alumno', label: 'alumno' })
  if (client.alumnoParticular)
    activeRoles.push({ key: 'alumno_particular', label: 'alumno particular' })
  const stackBadges = activeRoles.length >= 2
  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {client.nombre} {client.apellido}
          </div>
          {(client.dni || client.email) && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {client.dni ? `DNI ${client.dni}` : ''}
              {client.dni && client.email ? ' · ' : ''}
              {client.email || ''}
            </div>
          )}
          <div
            className={`mt-2 flex gap-2 ${stackBadges ? 'flex-col items-start' : 'flex-wrap'}`}
          >
            {client.paciente && (
              <RoleBadge variant="paciente">
                Paciente · {formatPrecioFrecuencia(client.paciente.precio_base, client.paciente.frecuencia_pago)}
                {client.paciente.precio_es_especial && ' · precio especial'}
              </RoleBadge>
            )}
            {client.alumno && client.grupos.length === 0 && (
              <RoleBadge variant="alumno">Alumno</RoleBadge>
            )}
            {client.alumno &&
              client.grupos.map((g) => (
                <RoleBadge key={g.alumno_grupo_id} variant="grupo">
                  {g.grupo_titulo} ·{' '}
                  {formatPrecioFrecuencia(
                    g.precio_override ?? g.grupo_precio_base,
                    g.grupo_frecuencia_pago
                  )}
                  {g.precio_grupo_es_especial && ' · precio especial'}
                </RoleBadge>
              ))}
            {client.alumnoParticular && (
              <RoleBadge variant="alumno">
                Alumno particular · {TIPO_CLASE_DISPLAY[client.alumnoParticular.tipo_clase]} ·{' '}
                {formatPrecioFrecuencia(
                  client.alumnoParticular.precio_base,
                  client.alumnoParticular.frecuencia_pago
                )}
                {client.alumnoParticular.precio_es_especial && ' · precio especial'}
              </RoleBadge>
            )}
          </div>
        </div>
        {vista === 'activos' && (
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}>
              Editar
            </Button>
            {activeRoles.length === 1 ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onDeactivate(activeRoles[0].key)}
              >
                Dar de baja
              </Button>
            ) : (
              <div className="flex flex-col gap-1">
                {activeRoles.map((r) => (
                  <Button
                    key={r.key}
                    variant="destructive"
                    size="sm"
                    onClick={() => onDeactivate(r.key)}
                  >
                    Dar de baja como {r.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

function ClientForm({
  formData,
  setFormData,
  grupos,
  onToggleGrupo,
  onUpdateGrupoField,
  onSubmit,
  onCancel,
  submitting,
  error
}) {
  const isEditing = formData.editing !== null

  // Aviso si la persona tiene 2+ roles activos (al editar): los datos
  // personales se sincronizan en todos.
  const existingRoles = []
  if (isEditing) {
    if (formData.editing.paciente_id !== null) existingRoles.push('paciente')
    if (formData.editing.alumno_id !== null) existingRoles.push('alumno')
    if (formData.editing.alumno_particular_id !== null)
      existingRoles.push('alumno particular')
  }
  const hasMultipleRoles = existingRoles.length >= 2
  const existingRolesLabel = existingRoles.join(', ')

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <h2 className="text-xl font-semibold">
        {isEditing ? 'Editar cliente' : 'Nuevo cliente'}
      </h2>

      {/* Persona */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Datos personales
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" required>
            <input
              type="text"
              className={fieldClass}
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              required
            />
          </Field>
          <Field label="Apellido" required>
            <input
              type="text"
              className={fieldClass}
              value={formData.apellido}
              onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
              required
            />
          </Field>
          <Field label="DNI">
            <input
              type="text"
              className={fieldClass}
              value={formData.dni}
              onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className={fieldClass}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </Field>
        </div>
        {hasMultipleRoles && (
          <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Esta persona tiene múltiples roles ({existingRolesLabel}). Los datos personales
            se actualizan en todos.
          </div>
        )}
      </section>

      {/* Paciente role */}
      <section className="space-y-3 rounded-md border p-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.esPaciente}
            onChange={(e) => setFormData({ ...formData, esPaciente: e.target.checked })}
          />
          <span className="text-sm font-medium">Es paciente</span>
        </label>
        {formData.esPaciente && (
          <div className="grid grid-cols-2 gap-3 pl-6">
            <Field label="Precio">
              <input
                type="number"
                min="0"
                step="0.01"
                className={fieldClass}
                value={formData.paciente.precio_base}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    paciente: { ...formData.paciente, precio_base: e.target.value }
                  })
                }
              />
            </Field>
            <Field label="Frecuencia de pago">
              <select
                className={fieldClass}
                value={formData.paciente.frecuencia_pago}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    paciente: { ...formData.paciente, frecuencia_pago: e.target.value }
                  })
                }
              >
                {FRECUENCIA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formData.paciente.precio_es_especial}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    paciente: { ...formData.paciente, precio_es_especial: e.target.checked }
                  })
                }
              />
              Precio especial
            </label>
          </div>
        )}
      </section>

      {/* Alumno role */}
      <section className="space-y-3 rounded-md border p-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.esAlumno}
            onChange={(e) => setFormData({ ...formData, esAlumno: e.target.checked })}
          />
          <span className="text-sm font-medium">Es alumno</span>
        </label>
        {formData.esAlumno && (
          <div className="space-y-3 pl-6">
            <div>
              <div className="mb-2 text-sm font-medium">Grupos</div>
              {grupos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay grupos activos.
                </p>
              ) : (
                <div className="space-y-2">
                  {grupos.map((g) => {
                    const selected = formData.alumno.grupos.find(
                      (sg) => sg.grupo_id === g.id
                    )
                    return (
                      <div key={g.id} className="rounded-md border p-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={!!selected}
                            onChange={() => onToggleGrupo(g)}
                          />
                          <span className="font-medium">{g.titulo}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatPrecio(g.precio_base)}
                          </span>
                        </label>
                        {selected && (
                          <div className="mt-2 space-y-2 pl-6">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={selected.precio_es_especial}
                                onChange={(e) =>
                                  onUpdateGrupoField(
                                    g.id,
                                    'precio_es_especial',
                                    e.target.checked
                                  )
                                }
                              />
                              Precio especial
                            </label>
                            {selected.precio_es_especial && (
                              <Field label="Precio">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className={fieldClass}
                                  value={selected.precio_override}
                                  onChange={(e) =>
                                    onUpdateGrupoField(
                                      g.id,
                                      'precio_override',
                                      e.target.value
                                    )
                                  }
                                />
                              </Field>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Alumno particular role */}
      <section className="space-y-3 rounded-md border p-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.esAlumnoParticular}
            onChange={(e) =>
              setFormData({ ...formData, esAlumnoParticular: e.target.checked })
            }
          />
          <span className="text-sm font-medium">Es alumno particular</span>
        </label>
        {formData.esAlumnoParticular && (
          <div className="grid grid-cols-2 gap-3 pl-6">
            <Field label="Tipo de clase" required>
              <select
                className={fieldClass}
                value={formData.alumnoParticular.tipo_clase}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    alumnoParticular: {
                      ...formData.alumnoParticular,
                      tipo_clase: e.target.value
                    }
                  })
                }
              >
                {TIPO_CLASE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Frecuencia de pago">
              <select
                className={fieldClass}
                value={formData.alumnoParticular.frecuencia_pago}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    alumnoParticular: {
                      ...formData.alumnoParticular,
                      frecuencia_pago: e.target.value
                    }
                  })
                }
              >
                {FRECUENCIA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Precio">
              <input
                type="number"
                min="0"
                step="0.01"
                className={fieldClass}
                value={formData.alumnoParticular.precio_base}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    alumnoParticular: {
                      ...formData.alumnoParticular,
                      precio_base: e.target.value
                    }
                  })
                }
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formData.alumnoParticular.precio_es_especial}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    alumnoParticular: {
                      ...formData.alumnoParticular,
                      precio_es_especial: e.target.checked
                    }
                  })
                }
              />
              Precio especial
            </label>
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Crear cliente'}
        </Button>
      </div>
    </form>
  )
}

export default Clientes
