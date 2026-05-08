import { ipcMain, app } from 'electron'
import { ImapFlow } from 'imapflow'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decryptIfSensitive, SENSITIVE_KEYS } from './configuracion.js'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
const ANTHROPIC_VERSION = '2023-06-01'
const ANTHROPIC_MAX_TOKENS = 1024

const IMAGE_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const ROL_TIPOS_VALIDOS = new Set(['paciente', 'alumno', 'alumno_particular'])

// ─── helpers ─────────────────────────────────────────

function leerCredenciales(db) {
  const rows = db.prepare('SELECT clave, valor FROM configuracion').all()
  const cred = {}
  for (const { clave, valor } of rows) {
    cred[clave] = SENSITIVE_KEYS.has(clave) ? decryptIfSensitive(clave, valor) : valor
  }
  return cred
}

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

function buildCandidatos(stmts, periodo, lunes) {
  const personasMap = new Map()
  const ensure = (id, nombre, apellido, email) => {
    if (!personasMap.has(id)) {
      personasMap.set(id, { persona_id: id, nombre, apellido, email, roles: [] })
    }
    return personasMap.get(id)
  }
  const yaPago = (rol_tipo, rol_id) => !!stmts.checkPagoConfirmado.get(rol_tipo, rol_id, periodo)

  for (const r of stmts.listPacientes.all()) {
    ensure(r.persona_id, r.nombre, r.apellido, r.email).roles.push({
      rol_tipo: 'paciente',
      rol_id: r.paciente_id,
      precio_base: r.precio_base,
      frecuencia_pago: r.frecuencia_pago,
      monto_esperado: montoMes(r.precio_base, r.frecuencia_pago, lunes),
      ya_pago: yaPago('paciente', r.paciente_id)
    })
  }

  for (const r of stmts.listAlumnosParticulares.all()) {
    ensure(r.persona_id, r.nombre, r.apellido, r.email).roles.push({
      rol_tipo: 'alumno_particular',
      rol_id: r.alumno_particular_id,
      precio_base: r.precio_base,
      frecuencia_pago: r.frecuencia_pago,
      monto_esperado: montoMes(r.precio_base, r.frecuencia_pago, lunes),
      ya_pago: yaPago('alumno_particular', r.alumno_particular_id)
    })
  }

  const alumnosMap = new Map()
  for (const r of stmts.listAlumnosGrupos.all()) {
    if (!alumnosMap.has(r.alumno_id)) {
      alumnosMap.set(r.alumno_id, {
        alumno_id: r.alumno_id,
        persona_id: r.persona_id,
        nombre: r.nombre,
        apellido: r.apellido,
        email: r.email,
        grupos: []
      })
    }
    const precio = r.precio_override ?? r.grupo_precio_base
    alumnosMap.get(r.alumno_id).grupos.push({
      titulo: r.titulo,
      monto_mes: montoMes(precio, r.grupo_frecuencia_pago, lunes)
    })
  }
  for (const a of alumnosMap.values()) {
    const monto_esperado = a.grupos.reduce((s, g) => s + g.monto_mes, 0)
    ensure(a.persona_id, a.nombre, a.apellido, a.email).roles.push({
      rol_tipo: 'alumno',
      rol_id: a.alumno_id,
      grupos: a.grupos,
      monto_esperado,
      ya_pago: yaPago('alumno', a.alumno_id)
    })
  }

  return Array.from(personasMap.values())
}

function buildPrompt({ mail_from, periodo, candidatos }) {
  return `Sos un asistente que analiza comprobantes de pago y los matchea contra una lista de personas registradas.

═══ TAREA 1 — EXTRACCIÓN DEL COMPROBANTE ═══

Del comprobante extraé:
- nombre_remitente: nombre completo de quien hizo el pago
- monto: solo el número (sin símbolos ni puntos de miles)
- fecha: en formato YYYY-MM-DD
- medio_pago: "transferencia" / "mercadopago" / "otro"

Si no podés identificar algún campo con certeza, usá null. Si el documento no parece un comprobante de pago válido, devolvé confianza_extraccion: 0.

═══ TAREA 2 — MATCHING CON PERSONA REGISTRADA ═══

Antes de decidir, listá mentalmente las señales encontradas y cómo las pesás. Esto es obligatorio — no saltees pasos.

REGLAS DE MATCHING:

1. El match debe ser siempre por NOMBRE COMPLETO (nombre Y apellido juntos). Nunca confirmes un match basándote solo en el nombre o solo en el apellido.

2. El orden de nombre y apellido puede variar — "García Juan", "Juan García", "García Rodríguez Juan Carlos" son todos el mismo. Hacé el match por presencia de tokens, no por orden.

3. Si el nombre del comprobante contiene nombres o apellidos extra (ej: "Juan Carlos García Rodríguez" en el comprobante vs "Juan García" en la base), consideralo match válido si los tokens registrados están presentes Y no hay otra persona registrada cuyos tokens también coincidan.

4. Sé tolerante a variaciones: tildes, mayúsculas, abreviaciones, iniciales.

5. El monto parcial NO es señal negativa — es normal que las personas paguen montos distintos al esperado. Usá el monto solo como desempate cuando hay ambigüedad entre varios candidatos.

ANÁLISIS DEL EMAIL DEL REMITENTE:

La parte antes del @ del email frecuentemente contiene nombre y/o apellido (juangarcia@gmail.com, j.garcia@hotmail.com, garcia.juan@outlook.com). Si los tokens del nombre registrado aparecen en la dirección de mail, tomalo como señal positiva adicional.

PESOS DE CONFIANZA_MATCH:

- Email del remitente coincide exactamente con email registrado → confianza_match >= 0.95
- Email del remitente no coincide exactamente pero el dominio es el mismo Y la parte local contiene tokens del nombre registrado (ej: base tiene jgarcia@gmail.com, remitente es juangarcia@gmail.com) → confianza_match >= 0.88
- Nombre completo coincide claramente (con o sin tokens extra), sin otra persona ambigua → confianza_match >= 0.85
- Nombre coincide + dirección de mail contiene tokens del nombre registrado → confianza_match >= 0.90
- Señales débiles o ambigüedad irresoluble → confianza_match < 0.7

DESEMPATES:

- Si hay ambigüedad entre dos o más candidatos y uno de ellos ya tiene un pago confirmado para el período actual (ya_pago: true), preferí al que NO pagó todavía. No descartés automáticamente a quien ya pagó — es posible que esté pagando un saldo pendiente — pero en caso de empate, priorizá al que no tiene pago registrado.

- Si la ambigüedad es irresoluble después de considerar todas las señales, devolvé persona_id: null.

═══ DATOS DE CONTEXTO ═══

Email del remitente del mail: ${mail_from || '(no disponible)'}
Período actual: ${periodo}

Personas registradas (solo personas con al menos un rol activo):
${JSON.stringify(candidatos, null, 2)}

═══ FORMATO DE RESPUESTA ═══

Respondé ÚNICAMENTE con este JSON, sin texto adicional, sin bloques de código markdown, sin explicaciones:

{
  "nombre_remitente": "nombre completo extraído",
  "monto": número (sin símbolos ni puntos de miles),
  "fecha": "YYYY-MM-DD",
  "medio_pago": "transferencia / mercadopago / otro",
  "confianza_extraccion": número entre 0 y 1,
  "persona_id": número o null,
  "rol_tipo": "paciente" / "alumno" / "alumno_particular" o null,
  "confianza_match": número entre 0 y 1
}`
}

function flattenBodyStructure(struct, acc = []) {
  if (!struct) return acc
  if (struct.childNodes && struct.childNodes.length) {
    for (const child of struct.childNodes) flattenBodyStructure(child, acc)
  } else {
    acc.push({
      part: struct.part || '1',
      type: (struct.type || '').toLowerCase(),
      disposition: (struct.disposition || '').toLowerCase(),
      filename: struct.dispositionParameters?.filename || struct.parameters?.name || null
    })
  }
  return acc
}

function findAdjuntoApto(parts) {
  // Preferimos PDF primero, después imágenes soportadas
  return (
    parts.find(
      (p) =>
        (p.disposition === 'attachment' || p.type === 'application/pdf') &&
        p.type === 'application/pdf'
    ) ||
    parts.find(
      (p) =>
        IMAGE_MEDIA_TYPES.has(p.type) &&
        (p.disposition === 'attachment' || p.disposition === 'inline')
    ) ||
    null
  )
}

function findTextPart(parts) {
  return (
    parts.find((p) => p.type === 'text/plain' && p.disposition !== 'attachment') ||
    parts.find((p) => p.type === 'text/html' && p.disposition !== 'attachment') ||
    null
  )
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (c) => chunks.push(c))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function sanitizeFilename(name) {
  return (name || 'comprobante').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
}

function extensionForMediaType(type) {
  if (type === 'application/pdf') return 'pdf'
  if (type === 'image/jpeg') return 'jpg'
  if (type === 'image/png') return 'png'
  if (type === 'image/gif') return 'gif'
  if (type === 'image/webp') return 'webp'
  return 'bin'
}

function htmlAPlano(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function callAnthropic(apiKey, content) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      messages: [{ role: 'user', content }]
    })
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 200)}`)
  }
  const json = await res.json()
  const textBlock = json.content?.find((c) => c.type === 'text')
  if (!textBlock) throw new Error('Respuesta sin contenido de texto')
  return textBlock.text
}

function parseAnthropicJson(text) {
  // Tolerar bloques de código markdown si la IA los agrega
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
  return JSON.parse(cleaned)
}

// ─── flujo principal ────────────────────────────────

export async function revisarMails(db) {
  const errores = []
  let procesados = 0

  let cred
  try {
    cred = leerCredenciales(db)
  } catch (err) {
    return {
      procesados: 0,
      errores: [{ uid: null, mensaje: `Lectura de credenciales: ${err.message}` }]
    }
  }

  if (!cred.imap_host || !cred.imap_user || !cred.imap_pass) {
    return { procesados: 0, errores: [] }
  }
  if (!cred.anthropic_api_key) {
    return {
      procesados: 0,
      errores: [{ uid: null, mensaje: 'API key de Anthropic no configurada' }]
    }
  }

  const port = parseInt(cred.imap_port) || 993
  const client = new ImapFlow({
    host: cred.imap_host,
    port,
    secure: port === 993,
    auth: { user: cred.imap_user, pass: cred.imap_pass },
    logger: false,
    socketTimeout: 30000
  })

  let opened = false
  try {
    await client.connect()
    await client.mailboxOpen('INBOX')
    opened = true

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const uidsRaw = await client.search(
      { or: [{ seen: false }, { since: sevenDaysAgo }] },
      { uid: true }
    )
    const uids = Array.from(new Set((uidsRaw || []).map(Number))).sort((a, b) => a - b)

    const checkUidStmt = db.prepare('SELECT 1 FROM pagos WHERE mail_uid = ?')
    const insertPagoStmt = db.prepare(`
      INSERT INTO pagos (
        persona_id, rol_tipo, rol_id, monto, fecha_pago, periodo_cubierto,
        origen, mail_uid, confianza_ia, estado,
        archivo_path, mail_from, mail_subject, mail_date
      ) VALUES (?, ?, ?, ?, ?, ?, 'ia', ?, ?, ?, ?, ?, ?, ?)
    `)

    const candidatosStmts = {
      listPacientes: db.prepare(`
        SELECT pa.id AS paciente_id, pe.id AS persona_id, pe.nombre, pe.apellido, pe.email,
               pa.precio_base, pa.frecuencia_pago
        FROM pacientes pa
        JOIN personas pe ON pe.id = pa.persona_id
        WHERE pa.activo = 1
      `),
      listAlumnosParticulares: db.prepare(`
        SELECT ap.id AS alumno_particular_id, pe.id AS persona_id, pe.nombre, pe.apellido, pe.email,
               ap.precio_base, ap.frecuencia_pago
        FROM alumnos_particulares ap
        JOIN personas pe ON pe.id = ap.persona_id
        WHERE ap.activo = 1
      `),
      listAlumnosGrupos: db.prepare(`
        SELECT a.id AS alumno_id, pe.id AS persona_id, pe.nombre, pe.apellido, pe.email,
               g.id AS grupo_id, g.titulo, g.precio_base AS grupo_precio_base,
               g.frecuencia_pago AS grupo_frecuencia_pago, ag.precio_override
        FROM alumnos a
        JOIN personas pe ON pe.id = a.persona_id
        JOIN alumno_grupo ag ON ag.alumno_id = a.id AND ag.egreso_en IS NULL
        JOIN grupos g ON g.id = ag.grupo_id AND g.activo = 1
        WHERE a.activo = 1
      `),
      checkPagoConfirmado: db.prepare(`
        SELECT 1 FROM pagos
        WHERE rol_tipo = ? AND rol_id = ? AND periodo_cubierto = ? AND estado = 'confirmado'
        LIMIT 1
      `)
    }

    const hoy = new Date()
    const periodoActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
    const lunesActual = lunesEnMes(hoy.getFullYear(), hoy.getMonth() + 1)

    for (const uid of uids) {
      const uidStr = String(uid)
      try {
        if (checkUidStmt.get(uidStr)) continue

        const msg = await client.fetchOne(
          uid,
          { envelope: true, bodyStructure: true },
          { uid: true }
        )
        if (!msg) continue

        const env = msg.envelope || {}
        const mail_from = env.from?.[0]?.address || null
        const mail_subject = env.subject || null
        const mail_date = env.date ? new Date(env.date).toISOString() : null

        const flatParts = flattenBodyStructure(msg.bodyStructure)
        const adjunto = findAdjuntoApto(flatParts)

        // ya_pago se calcula con el período del comprobante (proxy: mail_date),
        // no con el período de hoy. Mail_date suele coincidir con la fecha del pago.
        const periodoComprobante = mail_date ? mail_date.slice(0, 7) : periodoActual

        // Reconstruimos los candidatos por mail para reflejar pagos recién insertados
        // en el campo ya_pago (en caso de procesar varios mails en la misma corrida).
        const candidatos = buildCandidatos(candidatosStmts, periodoComprobante, lunesActual)
        const promptText = buildPrompt({
          mail_from,
          periodo: periodoComprobante,
          candidatos
        })

        let archivo_path = null
        let content

        if (adjunto) {
          const dl = await client.download(uid, adjunto.part, { uid: true })
          const buf = await streamToBuffer(dl.content)

          const date = mail_date ? new Date(mail_date) : new Date()
          const yyyy = String(date.getFullYear())
          const mm = String(date.getMonth() + 1).padStart(2, '0')
          const dir = join(app.getPath('userData'), 'comprobantes', yyyy, mm)
          ensureDir(dir)

          const baseName = sanitizeFilename(
            adjunto.filename || `comprobante.${extensionForMediaType(adjunto.type)}`
          )
          archivo_path = join(dir, `${uidStr}-${baseName}`)
          writeFileSync(archivo_path, buf)

          const b64 = buf.toString('base64')
          if (adjunto.type === 'application/pdf') {
            content = [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: b64 }
              },
              { type: 'text', text: promptText }
            ]
          } else {
            content = [
              {
                type: 'image',
                source: { type: 'base64', media_type: adjunto.type, data: b64 }
              },
              { type: 'text', text: promptText }
            ]
          }
        } else {
          // Fallback: cuerpo del mail
          const textPart = findTextPart(flatParts)
          let textoMail = ''
          if (textPart) {
            const dl = await client.download(uid, textPart.part, { uid: true })
            const buf = await streamToBuffer(dl.content)
            textoMail = buf.toString('utf8')
            if (textPart.type === 'text/html') textoMail = htmlAPlano(textoMail)
            textoMail = textoMail.slice(0, 20000)
          }
          content = [
            {
              type: 'text',
              text: promptText + '\n\nContenido del mail:\n' + textoMail
            }
          ]
        }

        // ── Llamada a Claude ──
        const responseText = await callAnthropic(cred.anthropic_api_key, content)
        let parsed
        try {
          parsed = parseAnthropicJson(responseText)
        } catch (err) {
          errores.push({
            uid: uidStr,
            mensaje: `Respuesta de IA no parseable: ${err.message}`
          })
          continue
        }

        const confianza_extraccion = Number(parsed.confianza_extraccion) || 0
        if (confianza_extraccion < 0.3) continue

        const confianza_match = Number(parsed.confianza_match) || 0

        // Validamos persona_id contra los candidatos que efectivamente le mandamos
        // a la IA (evita alucinaciones) y derivamos rol_id del rol_tipo elegido.
        const candidatosMap = new Map(candidatos.map((c) => [c.persona_id, c]))
        let persona_id = parsed.persona_id != null ? Number(parsed.persona_id) : null
        let rol_tipo = parsed.rol_tipo || null
        let rol_id = null

        if (persona_id != null) {
          const candidato = candidatosMap.get(persona_id)
          if (!candidato) {
            // persona_id no estaba en la lista enviada
            persona_id = null
            rol_tipo = null
          } else if (rol_tipo) {
            if (!ROL_TIPOS_VALIDOS.has(rol_tipo)) {
              rol_tipo = null
            } else {
              const rol = candidato.roles.find((r) => r.rol_tipo === rol_tipo)
              if (rol) {
                rol_id = rol.rol_id
              } else {
                rol_tipo = null
              }
            }
          }
        }

        const confianza_final = Math.max(0, Math.min(1, confianza_extraccion, confianza_match))
        // Sólo se confirma automáticamente cuando hay match completo y confianza alta;
        // en cualquier otro caso queda en revisión.
        const estado = persona_id && rol_id && confianza_final >= 0.85 ? 'confirmado' : 'revision'

        const fecha_pago =
          parsed.fecha && /^\d{4}-\d{2}-\d{2}$/.test(parsed.fecha) ? parsed.fecha : null
        const monto = Number(parsed.monto) || 0
        if (!fecha_pago || monto <= 0) {
          errores.push({ uid: uidStr, mensaje: 'monto o fecha inválidos' })
          continue
        }
        const periodo_cubierto = fecha_pago.slice(0, 7)

        insertPagoStmt.run(
          persona_id,
          rol_tipo,
          rol_id,
          monto,
          fecha_pago,
          periodo_cubierto,
          uidStr,
          confianza_final,
          estado,
          archivo_path,
          mail_from,
          mail_subject,
          mail_date
        )

        procesados++
      } catch (err) {
        errores.push({ uid: uidStr, mensaje: err.message })
      }
    }
  } catch (err) {
    errores.push({ uid: null, mensaje: `Conexión IMAP: ${err.message}` })
  } finally {
    if (opened) {
      try {
        await client.logout()
      } catch {
        /* ignore */
      }
    } else {
      try {
        await client.close()
      } catch {
        /* ignore */
      }
    }
  }

  return { procesados, errores }
}

export function registerMailHandlers(db) {
  ipcMain.handle('mail:revisar-ahora', async () => {
    try {
      const result = await revisarMails(db)
      return { ok: true, data: result }
    } catch (err) {
      return {
        ok: false,
        error: { code: 'MAIL_REVISION_FAILED', message: err.message }
      }
    }
  })
}
