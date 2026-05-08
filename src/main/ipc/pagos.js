import { ipcMain, shell } from 'electron'

const ESTADOS_VALIDOS = new Set(['confirmado', 'revision', 'rechazado'])
const ROL_TIPOS_VALIDOS = new Set(['paciente', 'alumno', 'alumno_particular'])

export function registerPagosHandlers(db) {
  const listStmt = db.prepare(`
    SELECT
      p.id,
      p.persona_id,
      p.rol_tipo,
      p.rol_id,
      p.monto,
      p.fecha_pago,
      p.periodo_cubierto,
      p.origen,
      p.mail_uid,
      p.confianza_ia,
      p.estado,
      p.creado_en,
      p.archivo_path,
      p.mail_from,
      p.mail_subject,
      p.mail_date,
      pe.nombre  AS persona_nombre,
      pe.apellido AS persona_apellido
    FROM pagos p
    LEFT JOIN personas pe ON pe.id = p.persona_id
    WHERE p.periodo_cubierto = printf('%04d-%02d', ?, ?)
       OR p.estado = 'revision'
    ORDER BY (p.estado = 'revision') DESC, p.fecha_pago DESC
  `)

  const checkExistsStmt = db.prepare('SELECT id FROM pagos WHERE id = ?')

  const insertStmt = db.prepare(`
    INSERT INTO pagos (
      persona_id, rol_tipo, rol_id, monto, fecha_pago, periodo_cubierto,
      origen, estado
    ) VALUES (?, ?, ?, ?, ?, ?, 'efectivo', 'confirmado')
  `)

  const updateStmt = db.prepare(`
    UPDATE pagos
    SET persona_id = ?, rol_tipo = ?, rol_id = ?, estado = ?
    WHERE id = ?
  `)

  ipcMain.handle('pagos:list', (_e, { anio, mes }) => {
    try {
      const rows = listStmt.all(anio, mes)
      return { ok: true, data: rows }
    } catch (err) {
      return { ok: false, error: { code: 'LIST_FAILED', message: err.message } }
    }
  })

  ipcMain.handle('pagos:create', (_e, data) => {
    const { persona_id, rol_tipo, rol_id, monto, fecha_pago, periodo_cubierto } = data || {}

    if (persona_id == null) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'persona_id es obligatorio' }
      }
    }
    if (rol_tipo == null) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'rol_tipo es obligatorio' }
      }
    }
    if (!ROL_TIPOS_VALIDOS.has(rol_tipo)) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: `rol_tipo inválido: ${rol_tipo}` }
      }
    }
    if (rol_id == null) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'rol_id es obligatorio' }
      }
    }
    const montoNum = Number(monto)
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'monto debe ser mayor a 0' }
      }
    }
    if (!fecha_pago || !/^\d{4}-\d{2}-\d{2}$/.test(fecha_pago)) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'fecha_pago debe estar en formato YYYY-MM-DD'
        }
      }
    }

    try {
      const result = insertStmt.run(
        persona_id,
        rol_tipo,
        rol_id,
        montoNum,
        fecha_pago,
        periodo_cubierto ?? null
      )
      return { ok: true, data: { id: result.lastInsertRowid } }
    } catch (err) {
      return { ok: false, error: { code: 'CREATE_FAILED', message: err.message } }
    }
  })

  ipcMain.handle('pagos:update', (_e, data) => {
    const { id, persona_id, rol_tipo, rol_id, estado } = data || {}

    if (id == null) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'id es obligatorio' }
      }
    }
    if (!ESTADOS_VALIDOS.has(estado)) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: `estado inválido: ${estado}` }
      }
    }
    if (rol_tipo != null && !ROL_TIPOS_VALIDOS.has(rol_tipo)) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: `rol_tipo inválido: ${rol_tipo}` }
      }
    }

    const exists = checkExistsStmt.get(id)
    if (!exists) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Pago no encontrado' } }
    }

    try {
      updateStmt.run(persona_id ?? null, rol_tipo ?? null, rol_id ?? null, estado, id)
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: { code: 'UPDATE_FAILED', message: err.message } }
    }
  })

  ipcMain.handle('pagos:abrir-comprobante', async (_e, { archivo_path }) => {
    if (!archivo_path) {
      return {
        ok: false,
        error: {
          code: 'ARCHIVO_NO_DISPONIBLE',
          message: 'No hay archivo asociado a este pago'
        }
      }
    }
    try {
      const result = await shell.openPath(archivo_path)
      // shell.openPath devuelve string vacío si fue exitoso, o un mensaje de error
      if (result) {
        return { ok: false, error: { code: 'ABRIR_FAILED', message: result } }
      }
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: { code: 'ABRIR_FAILED', message: err.message } }
    }
  })
}
