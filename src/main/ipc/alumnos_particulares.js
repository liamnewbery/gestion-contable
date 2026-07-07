import { ipcMain } from 'electron'

const normText = (v) => (v == null || v === '' ? null : v)
const normNumber = (v) => (v == null || v === '' ? null : Number(v))
const normBool = (v) => (v ? 1 : 0)

function mapError(err, defaultCode) {
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    if (err.message.includes('personas.dni')) {
      return { code: 'DNI_DUPLICADO', message: 'Ya existe una persona con ese DNI.' }
    }
    if (err.message.includes('personas.email')) {
      return { code: 'EMAIL_DUPLICADO', message: 'Ya existe una persona con ese email.' }
    }
  }
  if (err.message === 'ALUMNO_PARTICULAR_YA_EXISTE') {
    return {
      code: 'ALUMNO_PARTICULAR_YA_EXISTE',
      message: 'Esta persona ya tiene un alumno particular activo.'
    }
  }
  if (err.message === 'NOT_FOUND') {
    return { code: 'NOT_FOUND', message: 'Alumno particular no encontrado.' }
  }
  return { code: defaultCode, message: err.message }
}

export function registerAlumnosParticularesHandlers(db) {
  const insertPersonaStmt = db.prepare(`
    INSERT INTO personas (nombre, apellido, dni, email)
    VALUES (@nombre, @apellido, @dni, @email)
  `)

  const updatePersonaStmt = db.prepare(`
    UPDATE personas SET nombre = @nombre, apellido = @apellido, dni = @dni, email = @email
    WHERE id = @id
  `)

  const insertStmt = db.prepare(`
    INSERT INTO alumnos_particulares
      (persona_id, tipo_clase, precio_base, frecuencia_pago, precio_es_especial)
    VALUES
      (@persona_id, @tipo_clase, @precio_base, @frecuencia_pago, @precio_es_especial)
  `)

  const updateStmt = db.prepare(`
    UPDATE alumnos_particulares
    SET tipo_clase = @tipo_clase,
        precio_base = @precio_base,
        frecuencia_pago = @frecuencia_pago,
        precio_es_especial = @precio_es_especial
    WHERE id = @id
  `)

  const findActiveByPersonaStmt = db.prepare(
    'SELECT id FROM alumnos_particulares WHERE persona_id = ? AND activo = 1'
  )

  const checkExistsStmt = db.prepare('SELECT id FROM alumnos_particulares WHERE id = ?')

  const deactivateStmt = db.prepare('UPDATE alumnos_particulares SET activo = 0 WHERE id = ?')

  const reactivateStmt = db.prepare('UPDATE alumnos_particulares SET activo = 1 WHERE id = ?')

  const getPersonaStmt = db.prepare('SELECT persona_id FROM alumnos_particulares WHERE id = ?')

  const getFullStmt = db.prepare(`
    SELECT
      ap.id              AS alumno_particular_id,
      pe.id              AS persona_id,
      pe.nombre,
      pe.apellido,
      pe.dni,
      pe.email,
      ap.tipo_clase,
      ap.precio_base,
      ap.frecuencia_pago,
      ap.precio_es_especial,
      ap.activo,
      CASE WHEN EXISTS (
        SELECT 1 FROM pacientes p WHERE p.persona_id = pe.id AND p.activo = 1
      ) THEN 1 ELSE 0 END AS tiene_paciente,
      CASE WHEN EXISTS (
        SELECT 1 FROM alumnos a WHERE a.persona_id = pe.id AND a.activo = 1
      ) THEN 1 ELSE 0 END AS tiene_alumno
    FROM alumnos_particulares ap
    JOIN personas pe ON pe.id = ap.persona_id
    WHERE ap.id = ?
  `)

  const listActivosStmt = db.prepare(`
    SELECT
      ap.id              AS alumno_particular_id,
      pe.id              AS persona_id,
      pe.nombre,
      pe.apellido,
      pe.dni,
      pe.email,
      ap.tipo_clase,
      ap.precio_base,
      ap.frecuencia_pago,
      ap.precio_es_especial,
      CASE WHEN EXISTS (
        SELECT 1 FROM pacientes p WHERE p.persona_id = pe.id AND p.activo = 1
      ) THEN 1 ELSE 0 END AS tiene_paciente,
      CASE WHEN EXISTS (
        SELECT 1 FROM alumnos a WHERE a.persona_id = pe.id AND a.activo = 1
      ) THEN 1 ELSE 0 END AS tiene_alumno
    FROM alumnos_particulares ap
    JOIN personas pe ON pe.id = ap.persona_id
    WHERE ap.activo = 1
    ORDER BY pe.apellido ASC, pe.nombre ASC
  `)

  const listInactivosStmt = db.prepare(`
    SELECT
      ap.id              AS alumno_particular_id,
      pe.id              AS persona_id,
      pe.nombre,
      pe.apellido,
      pe.dni,
      pe.email,
      ap.tipo_clase,
      ap.precio_base,
      ap.frecuencia_pago,
      ap.precio_es_especial,
      CASE WHEN EXISTS (
        SELECT 1 FROM pacientes p WHERE p.persona_id = pe.id AND p.activo = 1
      ) THEN 1 ELSE 0 END AS tiene_paciente,
      CASE WHEN EXISTS (
        SELECT 1 FROM alumnos a WHERE a.persona_id = pe.id AND a.activo = 1
      ) THEN 1 ELSE 0 END AS tiene_alumno
    FROM alumnos_particulares ap
    JOIN personas pe ON pe.id = ap.persona_id
    WHERE ap.activo = 0
    ORDER BY pe.apellido ASC, pe.nombre ASC
  `)

  const createTx = db.transaction((data) => {
    let persona_id = data.persona_id ?? null
    if (!persona_id) {
      const personaResult = insertPersonaStmt.run({
        nombre: data.nombre,
        apellido: data.apellido,
        dni: normText(data.dni),
        email: normText(data.email)
      })
      persona_id = personaResult.lastInsertRowid
    }
    const existing = findActiveByPersonaStmt.get(persona_id)
    if (existing) throw new Error('ALUMNO_PARTICULAR_YA_EXISTE')
    const result = insertStmt.run({
      persona_id,
      tipo_clase: data.tipo_clase,
      precio_base: normNumber(data.precio_base),
      frecuencia_pago: normText(data.frecuencia_pago),
      precio_es_especial: normBool(data.precio_es_especial)
    })
    return result.lastInsertRowid
  })

  const updateTx = db.transaction((data) => {
    const exists = checkExistsStmt.get(data.alumno_particular_id)
    if (!exists) throw new Error('NOT_FOUND')
    updatePersonaStmt.run({
      id: data.persona_id,
      nombre: data.nombre,
      apellido: data.apellido,
      dni: normText(data.dni),
      email: normText(data.email)
    })
    updateStmt.run({
      id: data.alumno_particular_id,
      tipo_clase: data.tipo_clase,
      precio_base: normNumber(data.precio_base),
      frecuencia_pago: normText(data.frecuencia_pago),
      precio_es_especial: normBool(data.precio_es_especial)
    })
  })

  ipcMain.handle('alumnos_particulares:list', () => {
    try {
      return { ok: true, data: listActivosStmt.all() }
    } catch (err) {
      return { ok: false, error: { code: 'LIST_FAILED', message: err.message } }
    }
  })

  ipcMain.handle('alumnos_particulares:list-inactivos', () => {
    try {
      return { ok: true, data: listInactivosStmt.all() }
    } catch (err) {
      return { ok: false, error: { code: 'LIST_FAILED', message: err.message } }
    }
  })

  ipcMain.handle('alumnos_particulares:create', (_e, data) => {
    try {
      const id = createTx(data)
      return { ok: true, data: getFullStmt.get(id) }
    } catch (err) {
      return { ok: false, error: mapError(err, 'CREATE_FAILED') }
    }
  })

  ipcMain.handle('alumnos_particulares:update', (_e, data) => {
    try {
      updateTx(data)
      return { ok: true, data: getFullStmt.get(data.alumno_particular_id) }
    } catch (err) {
      return { ok: false, error: mapError(err, 'UPDATE_FAILED') }
    }
  })

  ipcMain.handle('alumnos_particulares:deactivate', (_e, { alumno_particular_id }) => {
    try {
      const exists = checkExistsStmt.get(alumno_particular_id)
      if (!exists) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Alumno particular no encontrado.' }
        }
      }
      deactivateStmt.run(alumno_particular_id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: { code: 'DEACTIVATE_FAILED', message: err.message } }
    }
  })

  ipcMain.handle('alumnos_particulares:reactivate', (_e, { alumno_particular_id }) => {
    try {
      const row = getPersonaStmt.get(alumno_particular_id)
      if (!row) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Alumno particular no encontrado.' }
        }
      }
      if (findActiveByPersonaStmt.get(row.persona_id)) {
        return {
          ok: false,
          error: {
            code: 'ALUMNO_PARTICULAR_YA_EXISTE',
            message: 'Esta persona ya tiene un alumno particular activo.'
          }
        }
      }
      reactivateStmt.run(alumno_particular_id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: { code: 'REACTIVATE_FAILED', message: err.message } }
    }
  })
}
