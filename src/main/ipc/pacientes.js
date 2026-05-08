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
  if (err.message === 'PACIENTE_YA_EXISTE') {
    return { code: 'PACIENTE_YA_EXISTE', message: 'Esta persona ya tiene un paciente activo.' }
  }
  if (err.message === 'NOT_FOUND') {
    return { code: 'NOT_FOUND', message: 'Paciente no encontrado.' }
  }
  return { code: defaultCode, message: err.message }
}

export function registerPacientesHandlers(db) {
  const insertPersonaStmt = db.prepare(`
    INSERT INTO personas (nombre, apellido, dni, email)
    VALUES (@nombre, @apellido, @dni, @email)
  `)

  const updatePersonaStmt = db.prepare(`
    UPDATE personas SET nombre = @nombre, apellido = @apellido, dni = @dni, email = @email
    WHERE id = @id
  `)

  const insertPacienteStmt = db.prepare(`
    INSERT INTO pacientes (persona_id, precio_base, frecuencia_pago, precio_es_especial)
    VALUES (@persona_id, @precio_base, @frecuencia_pago, @precio_es_especial)
  `)

  const updatePacienteStmt = db.prepare(`
    UPDATE pacientes
    SET precio_base = @precio_base,
        frecuencia_pago = @frecuencia_pago,
        precio_es_especial = @precio_es_especial
    WHERE id = @id
  `)

  const findActivePacienteByPersonaStmt = db.prepare(
    'SELECT id FROM pacientes WHERE persona_id = ? AND activo = 1'
  )

  const checkPacienteExistsStmt = db.prepare('SELECT id FROM pacientes WHERE id = ?')

  const deactivatePacienteStmt = db.prepare('UPDATE pacientes SET activo = 0 WHERE id = ?')

  const getPacienteFullStmt = db.prepare(`
    SELECT
      p.id              AS paciente_id,
      pe.id             AS persona_id,
      pe.nombre,
      pe.apellido,
      pe.dni,
      pe.email,
      p.precio_base,
      p.frecuencia_pago,
      p.precio_es_especial,
      p.activo,
      CASE WHEN EXISTS (
        SELECT 1 FROM alumnos a WHERE a.persona_id = pe.id AND a.activo = 1
      ) THEN 1 ELSE 0 END AS tiene_alumno
    FROM pacientes p
    JOIN personas pe ON pe.id = p.persona_id
    WHERE p.id = ?
  `)

  const listActivosStmt = db.prepare(`
    SELECT
      p.id              AS paciente_id,
      pe.id             AS persona_id,
      pe.nombre,
      pe.apellido,
      pe.dni,
      pe.email,
      p.precio_base,
      p.frecuencia_pago,
      p.precio_es_especial,
      CASE WHEN EXISTS (
        SELECT 1 FROM alumnos a WHERE a.persona_id = pe.id AND a.activo = 1
      ) THEN 1 ELSE 0 END AS tiene_alumno
    FROM pacientes p
    JOIN personas pe ON pe.id = p.persona_id
    WHERE p.activo = 1
    ORDER BY pe.apellido ASC, pe.nombre ASC
  `)

  const listInactivosStmt = db.prepare(`
    SELECT
      p.id              AS paciente_id,
      pe.id             AS persona_id,
      pe.nombre,
      pe.apellido,
      pe.dni,
      pe.email,
      p.precio_base,
      p.frecuencia_pago,
      p.precio_es_especial,
      CASE WHEN EXISTS (
        SELECT 1 FROM alumnos a WHERE a.persona_id = pe.id AND a.activo = 1
      ) THEN 1 ELSE 0 END AS tiene_alumno
    FROM pacientes p
    JOIN personas pe ON pe.id = p.persona_id
    WHERE p.activo = 0
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
    const existing = findActivePacienteByPersonaStmt.get(persona_id)
    if (existing) throw new Error('PACIENTE_YA_EXISTE')
    const pacResult = insertPacienteStmt.run({
      persona_id,
      precio_base: normNumber(data.precio_base),
      frecuencia_pago: normText(data.frecuencia_pago),
      precio_es_especial: normBool(data.precio_es_especial)
    })
    return pacResult.lastInsertRowid
  })

  const updateTx = db.transaction((data) => {
    const exists = checkPacienteExistsStmt.get(data.paciente_id)
    if (!exists) throw new Error('NOT_FOUND')
    updatePersonaStmt.run({
      id: data.persona_id,
      nombre: data.nombre,
      apellido: data.apellido,
      dni: normText(data.dni),
      email: normText(data.email)
    })
    updatePacienteStmt.run({
      id: data.paciente_id,
      precio_base: normNumber(data.precio_base),
      frecuencia_pago: normText(data.frecuencia_pago),
      precio_es_especial: normBool(data.precio_es_especial)
    })
  })

  ipcMain.handle('pacientes:list', () => {
    try {
      return { ok: true, data: listActivosStmt.all() }
    } catch (err) {
      return { ok: false, error: { code: 'LIST_FAILED', message: err.message } }
    }
  })

  ipcMain.handle('pacientes:list-inactivos', () => {
    try {
      return { ok: true, data: listInactivosStmt.all() }
    } catch (err) {
      return { ok: false, error: { code: 'LIST_FAILED', message: err.message } }
    }
  })

  ipcMain.handle('pacientes:create', (_e, data) => {
    try {
      const id = createTx(data)
      return { ok: true, data: getPacienteFullStmt.get(id) }
    } catch (err) {
      return { ok: false, error: mapError(err, 'CREATE_FAILED') }
    }
  })

  ipcMain.handle('pacientes:update', (_e, data) => {
    try {
      updateTx(data)
      return { ok: true, data: getPacienteFullStmt.get(data.paciente_id) }
    } catch (err) {
      return { ok: false, error: mapError(err, 'UPDATE_FAILED') }
    }
  })

  ipcMain.handle('pacientes:deactivate', (_e, { paciente_id }) => {
    try {
      const exists = checkPacienteExistsStmt.get(paciente_id)
      if (!exists) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Paciente no encontrado.' } }
      }
      deactivatePacienteStmt.run(paciente_id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: { code: 'DEACTIVATE_FAILED', message: err.message } }
    }
  })
}
