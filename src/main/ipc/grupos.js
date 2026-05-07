import { ipcMain } from 'electron'

const TIPO_CLASE_DISPLAY = {
  tarot: 'Tarot',
  astrologia: 'Astrología'
}

const MODALIDAD_DISPLAY = {
  presencial: 'Presencial',
  online: 'Online'
}

const DIA_PLURAL = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábados',
  domingo: 'Domingos'
}

function formatTitulo({ tipo_clase, modalidad, dia, horario }) {
  return `${TIPO_CLASE_DISPLAY[tipo_clase]} ${MODALIDAD_DISPLAY[modalidad]} ${DIA_PLURAL[dia]} ${horario}hs`
}

export function registerGruposHandlers(db) {
  const listActivosStmt = db.prepare(`
    SELECT g.*, COALESCE(c.alumnos_activos, 0) AS alumnos_activos
    FROM grupos g
    LEFT JOIN (
      SELECT grupo_id, COUNT(*) AS alumnos_activos
      FROM alumno_grupo
      WHERE egreso_en IS NULL
      GROUP BY grupo_id
    ) c ON c.grupo_id = g.id
    WHERE g.activo = 1
    ORDER BY g.tipo_clase ASC, g.titulo ASC
  `)

  const listInactivosStmt = db.prepare(`
    SELECT * FROM grupos
    WHERE activo = 0
    ORDER BY tipo_clase ASC, titulo ASC
  `)

  const insertStmt = db.prepare(`
    INSERT INTO grupos (titulo, tipo_clase, modalidad, dia, horario, precio_base, frecuencia_pago)
    VALUES (@titulo, @tipo_clase, @modalidad, @dia, @horario, @precio_base, @frecuencia_pago)
  `)

  const getByIdStmt = db.prepare('SELECT * FROM grupos WHERE id = ?')

  const updateStmt = db.prepare(`
    UPDATE grupos
    SET titulo = @titulo,
        tipo_clase = @tipo_clase,
        modalidad = @modalidad,
        dia = @dia,
        horario = @horario,
        precio_base = @precio_base,
        frecuencia_pago = @frecuencia_pago
    WHERE id = @id
  `)

  const countAlumnosActivosStmt = db.prepare(`
    SELECT COUNT(*) AS count
    FROM alumno_grupo
    WHERE grupo_id = ? AND egreso_en IS NULL
  `)

  const deactivateStmt = db.prepare('UPDATE grupos SET activo = 0 WHERE id = ?')

  ipcMain.handle('grupos:list', () => {
    try {
      return { ok: true, data: listActivosStmt.all() }
    } catch (err) {
      return { ok: false, error: { code: 'LIST_FAILED', message: err.message } }
    }
  })

  ipcMain.handle('grupos:list-inactivos', () => {
    try {
      return { ok: true, data: listInactivosStmt.all() }
    } catch (err) {
      return { ok: false, error: { code: 'LIST_FAILED', message: err.message } }
    }
  })

  ipcMain.handle('grupos:create', (_e, data) => {
    try {
      const titulo = formatTitulo(data)
      const result = insertStmt.run({
        titulo,
        tipo_clase: data.tipo_clase,
        modalidad: data.modalidad,
        dia: data.dia,
        horario: data.horario,
        precio_base: data.precio_base ?? null,
        frecuencia_pago: data.frecuencia_pago ?? null
      })
      const grupo = getByIdStmt.get(result.lastInsertRowid)
      return { ok: true, data: grupo }
    } catch (err) {
      return { ok: false, error: { code: 'CREATE_FAILED', message: err.message } }
    }
  })

  ipcMain.handle('grupos:update', (_e, data) => {
    try {
      const existing = getByIdStmt.get(data.id)
      if (!existing) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Grupo no encontrado' } }
      }
      const titulo = formatTitulo(data)
      updateStmt.run({
        id: data.id,
        titulo,
        tipo_clase: data.tipo_clase,
        modalidad: data.modalidad,
        dia: data.dia,
        horario: data.horario,
        precio_base: data.precio_base ?? null,
        frecuencia_pago: data.frecuencia_pago ?? null
      })
      const updated = getByIdStmt.get(data.id)
      return { ok: true, data: updated }
    } catch (err) {
      return { ok: false, error: { code: 'UPDATE_FAILED', message: err.message } }
    }
  })

  ipcMain.handle('grupos:deactivate', (_e, { id }) => {
    try {
      const { count } = countAlumnosActivosStmt.get(id)
      if (count > 0) {
        return {
          ok: false,
          error: {
            code: 'TIENE_ALUMNOS_ACTIVOS',
            count,
            message: `Este grupo tiene ${count} ${count === 1 ? 'alumno activo' : 'alumnos activos'}. No podés darlo de baja hasta que todos hayan egresado.`
          }
        }
      }
      deactivateStmt.run(id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: { code: 'DEACTIVATE_FAILED', message: err.message } }
    }
  })
}
