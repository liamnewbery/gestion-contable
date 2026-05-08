import { ipcMain, safeStorage } from 'electron'
import { ImapFlow } from 'imapflow'
import nodemailer from 'nodemailer'

const SENSITIVE_KEYS = new Set(['imap_pass', 'smtp_pass', 'anthropic_api_key'])

const ALL_KEYS = [
  'mail_contador',
  'imap_host',
  'imap_port',
  'imap_user',
  'imap_pass',
  'smtp_host',
  'smtp_port',
  'smtp_user',
  'smtp_pass',
  'anthropic_api_key'
]

function encryptIfSensitive(clave, valor) {
  if (!SENSITIVE_KEYS.has(clave)) return valor
  if (!safeStorage.isEncryptionAvailable()) return valor
  return Buffer.from(safeStorage.encryptString(valor)).toString('base64')
}

function decryptIfSensitive(clave, valor) {
  if (!SENSITIVE_KEYS.has(clave)) return valor
  if (valor == null || valor === '') return valor
  if (!safeStorage.isEncryptionAvailable()) return valor
  try {
    return safeStorage.decryptString(Buffer.from(valor, 'base64'))
  } catch {
    // Si el valor fue guardado en texto plano (safeStorage no disponible
    // en un arranque anterior), lo devolvemos tal cual.
    return valor
  }
}

export function registerConfiguracionHandlers(db) {
  const getAllStmt = db.prepare('SELECT clave, valor FROM configuracion')
  const upsertStmt = db.prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)')

  ipcMain.handle('configuracion:get-all', () => {
    try {
      const rows = getAllStmt.all()
      const stored = new Map(rows.map((r) => [r.clave, r.valor]))
      const data = {}
      for (const k of ALL_KEYS) {
        const v = stored.get(k) ?? ''
        data[k] = decryptIfSensitive(k, v)
      }
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: { code: 'GET_ALL_FAILED', message: err.message } }
    }
  })

  ipcMain.handle('configuracion:set', (_e, { clave, valor }) => {
    try {
      const v = valor ?? ''
      const stored = encryptIfSensitive(clave, v)
      upsertStmt.run(clave, stored)
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: { code: 'SET_FAILED', message: err.message } }
    }
  })

  ipcMain.handle('configuracion:test-imap', async (_e, { host, port, user, pass }) => {
    let client = null
    try {
      const portNum = Number(port)
      client = new ImapFlow({
        host,
        port: portNum,
        secure: portNum === 993,
        auth: { user, pass },
        logger: false,
        socketTimeout: 10000
      })
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout (10 s)')), 10000)
      )
      await Promise.race([client.connect(), timeout])
      try {
        await client.logout()
      } catch {
        /* ignore logout errors */
      }
      return { ok: true, data: null }
    } catch (err) {
      try {
        if (client) await client.close()
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        error: { code: 'IMAP_CONNECTION_FAILED', message: err.message }
      }
    }
  })

  ipcMain.handle('configuracion:test-smtp', async (_e, { host, port, user, pass }) => {
    try {
      const portNum = Number(port)
      const transporter = nodemailer.createTransport({
        host,
        port: portNum,
        secure: portNum === 465,
        auth: { user, pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
      })
      await transporter.verify()
      transporter.close()
      return { ok: true, data: null }
    } catch (err) {
      return {
        ok: false,
        error: { code: 'SMTP_CONNECTION_FAILED', message: err.message }
      }
    }
  })

  ipcMain.handle('configuracion:test-anthropic', async (_e, { api_key }) => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    try {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        method: 'GET',
        headers: {
          'x-api-key': api_key,
          'anthropic-version': '2023-06-01'
        },
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      if (res.status === 200) {
        return { ok: true, data: null }
      }
      if (res.status === 401) {
        return {
          ok: false,
          error: { code: 'ANTHROPIC_INVALID_KEY', message: 'API key inválida' }
        }
      }
      return {
        ok: false,
        error: {
          code: 'ANTHROPIC_CONNECTION_FAILED',
          message: `HTTP ${res.status}`
        }
      }
    } catch (err) {
      clearTimeout(timeoutId)
      return {
        ok: false,
        error: { code: 'ANTHROPIC_CONNECTION_FAILED', message: err.message }
      }
    }
  })
}
