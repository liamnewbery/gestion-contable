import { ipcMain } from 'electron'

function lunesEnMes(anio, mes) {
  let count = 0
  const ultimoDia = new Date(anio, mes, 0).getDate()
  for (let d = 1; d <= ultimoDia; d++) {
    if (new Date(anio, mes - 1, d).getDay() === 1) count++
  }
  return count
}

function montoMes(precio, frecuencia, lunes) {
  if (precio == null) return 0
  if (frecuencia === 'mensual') return precio
  if (frecuencia === 'quincenal') return precio * 2
  if (frecuencia === 'semanal') return precio * lunes
  return 0
}

function sumValues(map) {
  let total = 0
  for (const v of map.values()) total += v
  return total
}

export function registerDashboardHandlers(db) {
  const listPacientesStmt = db.prepare(`
    SELECT
      p.id          AS paciente_id,
      pe.id         AS persona_id,
      pe.nombre,
      pe.apellido,
      p.precio_base,
      p.frecuencia_pago
    FROM pacientes p
    JOIN personas pe ON pe.id = p.persona_id
    WHERE p.activo = 1
    ORDER BY pe.apellido ASC, pe.nombre ASC
  `)

  const pagosPacientesMesStmt = db.prepare(`
    SELECT pg.rol_id AS paciente_id, pg.monto
    FROM pagos pg
    JOIN pacientes pa ON pa.id = pg.rol_id AND pa.activo = 1
    WHERE pg.rol_tipo = 'paciente'
      AND pg.periodo_cubierto = ?
      AND pg.estado = 'confirmado'
  `)

  const listAlumnosGruposStmt = db.prepare(`
    SELECT
      a.id              AS alumno_id,
      pe.id             AS persona_id,
      pe.nombre,
      pe.apellido,
      g.id              AS grupo_id,
      g.titulo,
      g.precio_base     AS grupo_precio_base,
      g.frecuencia_pago AS grupo_frecuencia_pago,
      ag.precio_override
    FROM alumnos a
    JOIN personas pe ON pe.id = a.persona_id
    JOIN alumno_grupo ag ON ag.alumno_id = a.id AND ag.egreso_en IS NULL
    JOIN grupos g ON g.id = ag.grupo_id AND g.activo = 1
    WHERE a.activo = 1
    ORDER BY pe.apellido ASC, pe.nombre ASC, g.titulo ASC
  `)

  const pagosAlumnosMesStmt = db.prepare(`
    SELECT pg.rol_id AS alumno_id, pg.monto
    FROM pagos pg
    JOIN alumnos a ON a.id = pg.rol_id AND a.activo = 1
    WHERE pg.rol_tipo = 'alumno'
      AND pg.periodo_cubierto = ?
      AND pg.estado = 'confirmado'
  `)

  const listAlumnosParticularesStmt = db.prepare(`
    SELECT
      ap.id          AS alumno_particular_id,
      pe.id          AS persona_id,
      pe.nombre,
      pe.apellido,
      ap.precio_base,
      ap.frecuencia_pago
    FROM alumnos_particulares ap
    JOIN personas pe ON pe.id = ap.persona_id
    WHERE ap.activo = 1
    ORDER BY pe.apellido ASC, pe.nombre ASC
  `)

  const pagosAlumnosParticularesMesStmt = db.prepare(`
    SELECT pg.rol_id AS alumno_particular_id, pg.monto
    FROM pagos pg
    JOIN alumnos_particulares ap ON ap.id = pg.rol_id AND ap.activo = 1
    WHERE pg.rol_tipo = 'alumno_particular'
      AND pg.periodo_cubierto = ?
      AND pg.estado = 'confirmado'
  `)

  const pagosEnRevisionStmt = db.prepare(
    "SELECT COUNT(*) AS count FROM pagos WHERE estado = 'revision'"
  )

  ipcMain.handle('dashboard:resumen', (_e, { anio, mes }) => {
    try {
      const periodo = `${anio}-${String(mes).padStart(2, '0')}`
      const lunes = lunesEnMes(anio, mes)

      // ─── PACIENTES ─────────────────────────────────────
      const pacientesRows = listPacientesStmt.all()
      const pagosPacientes = pagosPacientesMesStmt.all(periodo)
      const pacientesPagaron = new Map()
      for (const p of pagosPacientes) {
        pacientesPagaron.set(p.paciente_id, (pacientesPagaron.get(p.paciente_id) ?? 0) + p.monto)
      }
      const pacientesPendientes = []
      let pacientesMontoEsperado = 0
      let pacientesPagaronCount = 0
      for (const r of pacientesRows) {
        const monto_mes = montoMes(r.precio_base, r.frecuencia_pago, lunes)
        pacientesMontoEsperado += monto_mes
        const cobrado = pacientesPagaron.get(r.paciente_id) ?? 0
        if (monto_mes > 0 && cobrado < monto_mes) {
          pacientesPendientes.push({
            paciente_id: r.paciente_id,
            persona_id: r.persona_id,
            nombre: r.nombre,
            apellido: r.apellido,
            precio_base: r.precio_base,
            frecuencia_pago: r.frecuencia_pago,
            monto_mes,
            monto_cobrado: cobrado,
            saldo: monto_mes - cobrado
          })
        } else {
          pacientesPagaronCount++
        }
      }

      // ─── ALUMNOS GRUPALES ──────────────────────────────
      const alumnosGruposRows = listAlumnosGruposStmt.all()
      const pagosAlumnos = pagosAlumnosMesStmt.all(periodo)
      const alumnosPagaron = new Map()
      for (const p of pagosAlumnos) {
        alumnosPagaron.set(p.alumno_id, (alumnosPagaron.get(p.alumno_id) ?? 0) + p.monto)
      }
      const alumnosMap = new Map()
      for (const r of alumnosGruposRows) {
        if (!alumnosMap.has(r.alumno_id)) {
          alumnosMap.set(r.alumno_id, {
            alumno_id: r.alumno_id,
            persona_id: r.persona_id,
            nombre: r.nombre,
            apellido: r.apellido,
            grupos: []
          })
        }
        const precio_efectivo = r.precio_override ?? r.grupo_precio_base
        alumnosMap.get(r.alumno_id).grupos.push({
          grupo_id: r.grupo_id,
          titulo: r.titulo,
          precio_efectivo,
          frecuencia_pago: r.grupo_frecuencia_pago,
          monto_mes: montoMes(precio_efectivo, r.grupo_frecuencia_pago, lunes)
        })
      }
      const alumnosPendientes = []
      let alumnosMontoEsperado = 0
      let alumnosPagaronCount = 0
      for (const a of alumnosMap.values()) {
        const total = a.grupos.reduce((s, g) => s + g.monto_mes, 0)
        alumnosMontoEsperado += total
        const cobrado = alumnosPagaron.get(a.alumno_id) ?? 0
        if (total > 0 && cobrado < total) {
          alumnosPendientes.push({
            ...a,
            monto_cobrado: cobrado,
            saldo: total - cobrado
          })
        } else {
          alumnosPagaronCount++
        }
      }

      // ─── ALUMNOS PARTICULARES ──────────────────────────
      const alumnosParticularesRows = listAlumnosParticularesStmt.all()
      const pagosAlumnosParticulares = pagosAlumnosParticularesMesStmt.all(periodo)
      const alumnosParticularesPagaron = new Map()
      for (const p of pagosAlumnosParticulares) {
        alumnosParticularesPagaron.set(
          p.alumno_particular_id,
          (alumnosParticularesPagaron.get(p.alumno_particular_id) ?? 0) + p.monto
        )
      }
      const alumnosParticularesPendientes = []
      let alumnosParticularesMontoEsperado = 0
      let alumnosParticularesPagaronCount = 0
      for (const r of alumnosParticularesRows) {
        const monto_mes = montoMes(r.precio_base, r.frecuencia_pago, lunes)
        alumnosParticularesMontoEsperado += monto_mes
        const cobrado = alumnosParticularesPagaron.get(r.alumno_particular_id) ?? 0
        if (monto_mes > 0 && cobrado < monto_mes) {
          alumnosParticularesPendientes.push({
            alumno_particular_id: r.alumno_particular_id,
            persona_id: r.persona_id,
            nombre: r.nombre,
            apellido: r.apellido,
            precio_base: r.precio_base,
            frecuencia_pago: r.frecuencia_pago,
            monto_mes,
            monto_cobrado: cobrado,
            saldo: monto_mes - cobrado
          })
        } else {
          alumnosParticularesPagaronCount++
        }
      }

      const pagosEnRevision = pagosEnRevisionStmt.get().count

      return {
        ok: true,
        data: {
          pacientes: {
            total: pacientesRows.length,
            pagaron: pacientesPagaronCount,
            monto_cobrado: sumValues(pacientesPagaron),
            monto_esperado: pacientesMontoEsperado,
            pendientes: pacientesPendientes
          },
          alumnos_grupales: {
            total: alumnosMap.size,
            pagaron: alumnosPagaronCount,
            monto_cobrado: sumValues(alumnosPagaron),
            monto_esperado: alumnosMontoEsperado,
            pendientes: alumnosPendientes
          },
          alumnos_particulares: {
            total: alumnosParticularesRows.length,
            pagaron: alumnosParticularesPagaronCount,
            monto_cobrado: sumValues(alumnosParticularesPagaron),
            monto_esperado: alumnosParticularesMontoEsperado,
            pendientes: alumnosParticularesPendientes
          },
          pagos_en_revision: pagosEnRevision
        }
      }
    } catch (err) {
      return { ok: false, error: { code: 'RESUMEN_FAILED', message: err.message } }
    }
  })
}
