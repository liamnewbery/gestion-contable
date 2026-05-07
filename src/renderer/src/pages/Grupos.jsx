import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

const TIPO_CLASE_OPTIONS = [
  { value: 'tarot', label: 'Tarot' },
  { value: 'astrologia', label: 'Astrología' }
]

const MODALIDAD_OPTIONS = [
  { value: 'presencial', label: 'Presencial' },
  { value: 'online', label: 'Online' }
]

const DIA_OPTIONS = [
  { value: 'lunes', label: 'Lunes' },
  { value: 'martes', label: 'Martes' },
  { value: 'miercoles', label: 'Miércoles' },
  { value: 'jueves', label: 'Jueves' },
  { value: 'viernes', label: 'Viernes' },
  { value: 'sabado', label: 'Sábado' },
  { value: 'domingo', label: 'Domingo' }
]

const FRECUENCIA_OPTIONS = [
  { value: '', label: '—' },
  { value: 'mensual', label: 'Mensual' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' }
]

const TIPO_CLASE_DISPLAY = { tarot: 'Tarot', astrologia: 'Astrología' }
const MODALIDAD_DISPLAY = { presencial: 'Presencial', online: 'Online' }
const DIA_PLURAL = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábados',
  domingo: 'Domingos'
}

const initialForm = {
  id: null,
  tipo_clase: 'tarot',
  modalidad: 'presencial',
  dia: 'lunes',
  horario: '',
  precio_base: '',
  frecuencia_pago: ''
}

function buildTitulo({ tipo_clase, modalidad, dia, horario }) {
  if (!tipo_clase || !modalidad || !dia || !horario) return ''
  return `${TIPO_CLASE_DISPLAY[tipo_clase]} ${MODALIDAD_DISPLAY[modalidad]} ${DIA_PLURAL[dia]} ${horario}hs`
}

function formatPrecio(value) {
  if (value == null) return 'Sin precio base'
  return `$${Number(value).toLocaleString('es-AR')}`
}

const fieldClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

function Modal({ children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function Grupos() {
  const [vista, setVista] = useState('activos')
  const [grupos, setGrupos] = useState([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState(null)

  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState('create')
  const [formData, setFormData] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)

  const [confirmGrupo, setConfirmGrupo] = useState(null)
  const [confirmBlocked, setConfirmBlocked] = useState(null)
  const [deactivating, setDeactivating] = useState(false)

  async function loadGrupos(targetVista) {
    setLoading(true)
    setPageError(null)
    const fn =
      targetVista === 'activos' ? window.api.grupos.list : window.api.grupos.listInactivos
    try {
      const res = await fn()
      if (!res.ok) {
        setPageError(res.error.message)
        setGrupos([])
        return
      }
      setGrupos(res.data)
    } catch (err) {
      setPageError(err.message)
      setGrupos([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadGrupos(vista)
  }, [vista])

  function openCreate() {
    setFormData(initialForm)
    setFormMode('create')
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(grupo) {
    setFormData({
      id: grupo.id,
      tipo_clase: grupo.tipo_clase,
      modalidad: grupo.modalidad,
      dia: grupo.dia,
      horario: grupo.horario,
      precio_base: grupo.precio_base ?? '',
      frecuencia_pago: grupo.frecuencia_pago ?? ''
    })
    setFormMode('edit')
    setFormError(null)
    setFormOpen(true)
  }

  function closeForm() {
    if (submitting) return
    setFormOpen(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    try {
      const payload = {
        tipo_clase: formData.tipo_clase,
        modalidad: formData.modalidad,
        dia: formData.dia,
        horario: formData.horario,
        precio_base: formData.precio_base === '' ? null : Number(formData.precio_base),
        frecuencia_pago: formData.frecuencia_pago || null
      }
      const res =
        formMode === 'create'
          ? await window.api.grupos.create(payload)
          : await window.api.grupos.update({ ...payload, id: formData.id })
      if (!res.ok) {
        setFormError(res.error.message)
        return
      }
      setFormOpen(false)
      await loadGrupos(vista)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openDeactivate(grupo) {
    setConfirmGrupo(grupo)
    if (grupo.alumnos_activos > 0) {
      setConfirmBlocked({
        count: grupo.alumnos_activos,
        message: `Este grupo tiene ${grupo.alumnos_activos} ${grupo.alumnos_activos === 1 ? 'alumno activo' : 'alumnos activos'}. No podés darlo de baja hasta que todos hayan egresado.`
      })
    } else {
      setConfirmBlocked(null)
    }
  }

  function closeConfirm() {
    if (deactivating) return
    setConfirmGrupo(null)
    setConfirmBlocked(null)
  }

  async function handleConfirmDeactivate() {
    setDeactivating(true)
    try {
      const res = await window.api.grupos.deactivate(confirmGrupo.id)
      if (!res.ok) {
        if (res.error.code === 'TIENE_ALUMNOS_ACTIVOS') {
          setConfirmBlocked({ count: res.error.count, message: res.error.message })
          return
        }
        setPageError(res.error.message)
        setConfirmGrupo(null)
        setConfirmBlocked(null)
        return
      }
      setConfirmGrupo(null)
      setConfirmBlocked(null)
      await loadGrupos(vista)
    } catch (err) {
      setPageError(err.message)
      setConfirmGrupo(null)
      setConfirmBlocked(null)
    } finally {
      setDeactivating(false)
    }
  }

  const previewTitulo = buildTitulo(formData)

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        {vista === 'activos' ? (
          <>
            <h1 className="text-4xl font-bold">Grupos</h1>
            <Button onClick={openCreate}>Nuevo grupo</Button>
          </>
        ) : (
          <>
            <h1 className="text-4xl font-bold">Grupos anteriores</h1>
            <Button variant="outline" onClick={() => setVista('activos')}>
              ← Volver a grupos activos
            </Button>
          </>
        )}
      </div>

      {pageError && (
        <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {pageError}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : grupos.length === 0 ? (
        <p className="text-muted-foreground">
          {vista === 'activos'
            ? 'Todavía no hay grupos. Creá el primero con el botón “Nuevo grupo”.'
            : 'No hay grupos anteriores.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {grupos.map((g) => (
            <li key={g.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{g.titulo}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {formatPrecio(g.precio_base)}
                    {g.frecuencia_pago ? ` · ${g.frecuencia_pago}` : ''}
                  </div>
                </div>
                {vista === 'activos' && (
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(g)}>
                      Editar
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => openDeactivate(g)}
                    >
                      Dar de baja
                    </Button>
                  </div>
                )}
              </div>
            </li>
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
            Ver grupos anteriores
          </button>
        </div>
      )}

      {formOpen && (
        <Modal onClose={closeForm}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="text-xl font-semibold">
              {formMode === 'create' ? 'Nuevo grupo' : 'Editar grupo'}
            </h2>

            <Field label="Tipo de clase">
              <select
                className={fieldClass}
                value={formData.tipo_clase}
                onChange={(e) => setFormData({ ...formData, tipo_clase: e.target.value })}
                required
              >
                {TIPO_CLASE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Modalidad">
              <select
                className={fieldClass}
                value={formData.modalidad}
                onChange={(e) => setFormData({ ...formData, modalidad: e.target.value })}
                required
              >
                {MODALIDAD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Día">
              <select
                className={fieldClass}
                value={formData.dia}
                onChange={(e) => setFormData({ ...formData, dia: e.target.value })}
                required
              >
                {DIA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Horario">
              <input
                type="time"
                className={fieldClass}
                value={formData.horario}
                onChange={(e) => setFormData({ ...formData, horario: e.target.value })}
                required
              />
            </Field>

            <Field label="Precio base">
              <input
                type="number"
                min="0"
                step="0.01"
                className={fieldClass}
                value={formData.precio_base}
                onChange={(e) => setFormData({ ...formData, precio_base: e.target.value })}
                placeholder="Opcional"
              />
            </Field>

            <Field label="Frecuencia de pago">
              <select
                className={fieldClass}
                value={formData.frecuencia_pago}
                onChange={(e) =>
                  setFormData({ ...formData, frecuencia_pago: e.target.value })
                }
              >
                {FRECUENCIA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                Título
              </div>
              <div className="font-medium">
                {previewTitulo || (
                  <span className="italic text-muted-foreground">completá los campos…</span>
                )}
              </div>
            </div>

            {formError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {formError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeForm}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? 'Guardando…'
                  : formMode === 'create'
                    ? 'Crear grupo'
                    : 'Guardar cambios'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {confirmGrupo && (
        <Modal onClose={closeConfirm}>
          {confirmBlocked ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">No se puede dar de baja</h2>
              <p className="text-sm">{confirmBlocked.message}</p>
              <div className="flex justify-end">
                <Button onClick={closeConfirm}>Entendido</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Dar de baja grupo</h2>
              <p className="text-sm">
                ¿Seguro que querés dar de baja el grupo{' '}
                <span className="font-semibold">{confirmGrupo.titulo}</span>? Esta acción no
                se puede deshacer.
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
          )}
        </Modal>
      )}
    </div>
  )
}

export default Grupos
