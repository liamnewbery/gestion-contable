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
  if (err.message === 'ALUMNO_YA_EXISTE') {
    return { code: 'ALUMNO_YA_EXISTE', message: 'Esta persona ya tiene un alumno activo.' }
  }
  if (err.message === 'NOT_FOUND') {
    return { code: 'NOT_FOUND', message: 'Alumno no encontrado.' }
  }
  return { code: defaultCode, message: err.message }
}

export function registerAlumnosHandlers(db) {
  const insertPersonaStmt = db.prepare(`
    INSERT INTO personas (nombre, apellido, dni, email)
    VALUES (@nombre, @apellido, @dni, @email)
  `)

  const updatePersonaStmt = db.prepare(`
    UPDATE personas SET nombre = @nombre, apellido = @apellido, dni = @dni, email = @email
    WHERE id = @id
  `)

  const insertAlumnoStmt = db.prepare(
    'INSERT INTO alumnos (persona_id) VALUES (@persona_id)'
  )

  const findActiveAlumnoByPersonaStmt = db.prepare(
    'SELECT id FROM alumnos WHERE persona_id = ? AND activo = 1'
  )

  const checkAlumnoExistsStmt = db.prepare('SELECT id FROM alumnos WHERE id = ?')

  const deactivateAlumnoStmt = db.prepare('UPDATE alumnos SET activo = 0 WHERE id = ?')

  const insertMembershipStmt = db.prepare(`
    INSERT INTO alumno_grupo (alumno_id, grupo_id, precio_override, precio_es_especial)
    VALUES (@alumno_id, @grupo_id, @precio_override, @precio_es_especial)
  `)

  const findMembershipStmt = db.prepare(
    'SELECT id, egreso_en FROM alumno_grupo WHERE alumno_id = ? AND grupo_id = ?'
  )

  const reviveMembershipStmt = db.prepare(`
    UPDATE alumno_grupo
    SET egreso_en = NULL,
        precio_override = @precio_override,
        precio_es_especial = @precio_es_especial
    WHERE id = @id
  `)

  const getActiveMembershipsStmt = db.prepare(
    'SELECT id, grupo_id FROM alumno_grupo WHERE alumno_id = ? AND egreso_en IS NULL'
  )

  const egresarMembershipStmt = db.prepare(
    "UPDATE alumno_grupo SET egreso_en = datetime('now') WHERE id = ?"
  )

  const listActivosStmt = db.prepare(`
    SELECT
      a.id                   AS alumno_id,
      pe.id                  AS persona_id,
      pe.nombre,
      pe.apellido,
      pe.dni,
      pe.email,
      ag.id                  AS alumno_grupo_id,
      ag.precio_override,
      ag.precio_es_especial  AS precio_grupo_es_especial,
      g.id                   AS grupo_id,
      g.titulo               AS grupo_titulo,
      g.tipo_clase           AS grupo_tipo_clase,
      g.precio_base          AS grupo_precio_base,
      g.frecuencia_pago      AS grupo_frecuencia_pago,
      CASE WHEN EXISTS (
        SELECT 1 FROM pacientes p WHERE p.persona_id = pe.id AND p.activo = 1
      ) THEN 1 ELSE 0 END AS tiene_paciente
    FROM alumnos a
    JOIN personas pe ON pe.id = a.persona_id
    LEFT JOIN alumno_grupo ag ON ag.alumno_id = a.id AND ag.egreso_en IS NULL
    LEFT JOIN grupos g ON g.id = ag.grupo_id AND g.activo = 1
    WHERE a.activo = 1
    ORDER BY pe.apellido ASC, pe.nombre ASC, (g.titulo IS NULL), g.titulo ASC
  `)

  const listInactivosStmt = db.prepare(`
    SELECT
      a.id                   AS alumno_id,
      pe.id                  AS persona_id,
      pe.nombre,
      pe.apellido,
      pe.dni,
      pe.email,
      NULL                   AS alumno_grupo_id,
      NULL                   AS precio_override,
      NULL                   AS precio_grupo_es_especial,
      NULL                   AS grupo_id,
      NULL                   AS grupo_titulo,
      NULL                   AS grupo_tipo_clase,
      NULL                   AS grupo_precio_base,
      NULL                   AS grupo_frecuencia_pago,
      CASE WHEN EXISTS (
        SELECT 1 FROM pacientes p WHERE p.persona_id = pe.id AND p.activo = 1
      ) THEN 1 ELSE 0 END AS tiene_paciente
    FROM alumnos a
    JOIN personas pe ON pe.id = a.persona_id
    WHERE a.activo = 0
    ORDER BY pe.apellido ASC, pe.nombre ASC
  `)

  function applyMemberships(alumno_id, grupos) {
    const incoming = grupos || []
    const incomingIds = new Set(incoming.map((g) => g.grupo_id))
    const currentActive = getActiveMembershipsStmt.all(alumno_id)

    for (const m of currentActive) {
      if (!incomingIds.has(m.grupo_id)) {
        egresarMembershipStmt.run(m.id)
      }
    }

    for (const g of incoming) {
      const precio_override = normNumber(g.precio_override)
      const precio_es_especial = normBool(g.precio_es_especial)
      const existing = findMembershipStmt.get(alumno_id, g.grupo_id)
      if (existing) {
        reviveMembershipStmt.run({ id: existing.id, precio_override, precio_es_especial })
      } else {
        insertMembershipStmt.run({
          alumno_id,
          grupo_id: g.grupo_id,
          precio_override,
          precio_es_especial
        })
      }
    }
  }

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
    const existing = findActiveAlumnoByPersonaStmt.get(persona_id)
    if (existing) throw new Error('ALUMNO_YA_EXISTE')
    const alumnoResult = insertAlumnoStmt.run({ persona_id })
    const alumno_id = alumnoResult.lastInsertRowid
    applyMemberships(alumno_id, data.grupos)
    return alumno_id
  })

  const updateTx = db.transaction((data) => {
    const exists = checkAlumnoExistsStmt.get(data.alumno_id)
    if (!exists) throw new Error('NOT_FOUND')
    updatePersonaStmt.run({
      id: data.persona_id,
      nombre: data.nombre,
      apellido: data.apellido,
      dni: normText(data.dni),
      email: normText(data.email)
    })
    applyMemberships(data.alumno_id, data.grupos)
  })

  function getAlumnoRows(alumno_id) {
    return listActivosStmt.all().filter((r) => r.alumno_id === alumno_id)
  }

  ipcMain.handle('alumnos:list', () => {
    try {
      return { ok: true, data: listActivosStmt.all() }
    } catch (err) {
      return { ok: false, error: { code: 'LIST_FAILED', message: err.message } }
    }
  })

  ipcMain.handle('alumnos:list-inactivos', () => {
    try {
      return { ok: true, data: listInactivosStmt.all() }
    } catch (err) {
      return { ok: false, error: { code: 'LIST_FAILED', message: err.message } }
    }
  })

  ipcMain.handle('alumnos:create', (_e, data) => {
    if (!data.grupos || data.grupos.length === 0) {
      return {
        ok: false,
        error: {
          code: 'GRUPO_REQUERIDO',
          message: 'Un alumno debe pertenecer al menos a un grupo.'
        }
      }
    }
    try {
      const id = createTx(data)
      return { ok: true, data: getAlumnoRows(id) }
    } catch (err) {
      return { ok: false, error: mapError(err, 'CREATE_FAILED') }
    }
  })

  ipcMain.handle('alumnos:update', (_e, data) => {
    if (!data.grupos || data.grupos.length === 0) {
      return {
        ok: false,
        error: {
          code: 'GRUPO_REQUERIDO',
          message: 'Un alumno debe pertenecer al menos a un grupo.'
        }
      }
    }
    try {
      updateTx(data)
      return { ok: true, data: getAlumnoRows(data.alumno_id) }
    } catch (err) {
      return { ok: false, error: mapError(err, 'UPDATE_FAILED') }
    }
  })

  ipcMain.handle('alumnos:deactivate', (_e, { alumno_id }) => {
    try {
      const exists = checkAlumnoExistsStmt.get(alumno_id)
      if (!exists) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Alumno no encontrado.' } }
      }
      deactivateAlumnoStmt.run(alumno_id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: { code: 'DEACTIVATE_FAILED', message: err.message } }
    }
  })
}
