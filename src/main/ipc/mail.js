import { ipcMain, app } from 'electron'
import { ImapFlow } from 'imapflow'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decryptIfSensitive, SENSITIVE_KEYS } from './configuracion.js'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
const ANTHROPIC_VERSION = '2023-06-01'
const ANTHROPIC_MAX_TOKENS = 1024

const PROMPT_EXTRACCION = `Analizá este comprobante de pago y extraé la información en formato JSON. Respondé ÚNICAMENTE con el JSON, sin texto adicional, sin bloques de código, sin explicaciones.

Formato esperado:
{
  "nombre_remitente": "nombre completo de quien hizo el pago",
  "monto": número (solo el número, sin símbolos ni puntos de miles),
  "fecha": "fecha del pago en formato YYYY-MM-DD",
  "medio_pago": "transferencia / mercadopago / otro",
  "confianza": número entre 0 y 1 indicando qué tan seguro estás de que esto es un comprobante de pago válido
}

Si no podés identificar algún campo con certeza, usá null. Si el documento no parece un comprobante de pago, devolvé confianza: 0.`

const IMAGE_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

// ─── helpers ─────────────────────────────────────────

function leerCredenciales(db) {
  const rows = db.prepare('SELECT clave, valor FROM configuracion').all()
  const cred = {}
  for (const { clave, valor } of rows) {
    cred[clave] = SENSITIVE_KEYS.has(clave) ? decryptIfSensitive(clave, valor) : valor
  }
  return cred
}

function normalize(s) {
  if (!s) return ''
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

function findPersona(db, mailFrom, nombreRemitente) {
  if (mailFrom) {
    const byEmail = db
      .prepare('SELECT id FROM personas WHERE LOWER(email) = LOWER(?)')
      .get(mailFrom)
    if (byEmail) return { persona_id: byEmail.id, matchType: 'email' }
  }

  if (nombreRemitente) {
    const target = normalize(nombreRemitente)
    if (!target) return { persona_id: null, matchType: 'none' }
    const personas = db.prepare('SELECT id, nombre, apellido FROM personas').all()
    // Coincidencia exacta (en cualquier orden nombre/apellido)
    for (const p of personas) {
      const full = normalize(`${p.nombre} ${p.apellido}`)
      const reverse = normalize(`${p.apellido} ${p.nombre}`)
      if (full === target || reverse === target) {
        return { persona_id: p.id, matchType: 'name' }
      }
    }
    // Substring fallback
    for (const p of personas) {
      const full = normalize(`${p.nombre} ${p.apellido}`)
      if (full && (full.includes(target) || target.includes(full))) {
        return { persona_id: p.id, matchType: 'name' }
      }
    }
  }

  return { persona_id: null, matchType: 'none' }
}

function findRol(db, persona_id) {
  const pa = db
    .prepare('SELECT id FROM pacientes WHERE persona_id = ? AND activo = 1')
    .get(persona_id)
  if (pa) return { rol_tipo: 'paciente', rol_id: pa.id }
  const al = db
    .prepare('SELECT id FROM alumnos WHERE persona_id = ? AND activo = 1')
    .get(persona_id)
  if (al) return { rol_tipo: 'alumno', rol_id: al.id }
  const ap = db
    .prepare('SELECT id FROM alumnos_particulares WHERE persona_id = ? AND activo = 1')
    .get(persona_id)
  if (ap) return { rol_tipo: 'alumno_particular', rol_id: ap.id }
  return null
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
              { type: 'text', text: PROMPT_EXTRACCION }
            ]
          } else {
            content = [
              {
                type: 'image',
                source: { type: 'base64', media_type: adjunto.type, data: b64 }
              },
              { type: 'text', text: PROMPT_EXTRACCION }
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
              text: PROMPT_EXTRACCION + '\n\nContenido del mail:\n' + textoMail
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

        const confianza = Number(parsed.confianza) || 0
        if (confianza < 0.3) continue

        const matchPersona = findPersona(db, mail_from, parsed.nombre_remitente)
        const matchRol = matchPersona.persona_id
          ? findRol(db, matchPersona.persona_id)
          : null

        let persona_id, rol_tipo, rol_id, factor
        if (!matchPersona.persona_id) {
          // Sin match de persona: pago entra con NULLs para revisión manual
          persona_id = null
          rol_tipo = null
          rol_id = null
          factor = 0.3
        } else if (!matchRol) {
          // Persona identificada pero sin roles activos: persona_id sí, rol NULL
          persona_id = matchPersona.persona_id
          rol_tipo = null
          rol_id = null
          factor = 0.3
        } else {
          // Match completo: persona + rol
          persona_id = matchPersona.persona_id
          rol_tipo = matchRol.rol_tipo
          rol_id = matchRol.rol_id
          factor =
            matchPersona.matchType === 'email'
              ? 1.0
              : matchPersona.matchType === 'name'
                ? 0.85
                : 0.3
        }

        const confianza_final = Math.max(0, Math.min(1, confianza * factor))
        // Sólo se confirma automáticamente cuando hay match completo y confianza alta;
        // en cualquier otro caso queda en revisión.
        const estado =
          matchPersona.persona_id && matchRol && confianza_final > 0.85
            ? 'confirmado'
            : 'revision'

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
