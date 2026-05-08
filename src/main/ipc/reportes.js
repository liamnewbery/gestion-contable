import { ipcMain, dialog, app, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import nodemailer from 'nodemailer'
import pdfmake from 'pdfmake'
import vfsFonts from 'pdfmake/build/vfs_fonts'
import { decryptIfSensitive } from './configuracion.js'

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
]

const TIPO_LABEL = {
  paciente: 'Paciente',
  alumno: 'Alumno grupal',
  alumno_particular: 'Alumno particular'
}

// pdfmake en Node es un singleton — fonts y vfs se configuran una vez al importar.
// Embebemos Roboto vía vfs (base64) para evitar acceso a disco; las built-in PDFKit
// (Helvetica) chocan con setLocalAccessPolicy.
for (const [name, b64] of Object.entries(vfsFonts)) {
  pdfmake.virtualfs.writeFileSync(name, b64, 'base64')
}
pdfmake.setFonts({
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf'
  }
})
pdfmake.setUrlAccessPolicy(() => false)
pdfmake.setLocalAccessPolicy(() => false)

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatMonto(n) {
  return `$ ${Number(n).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`
}

function formatDdMmYyyy(yyyy_mm_dd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyy_mm_dd)
  if (!m) return yyyy_mm_dd
  return `${m[3]}/${m[2]}/${m[1]}`
}

function compactDate(yyyy_mm_dd) {
  return yyyy_mm_dd.replace(/-/g, '')
}

function fechaGeneradoString() {
  const d = new Date()
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
}

function personaLabel(row) {
  if (!row.apellido && !row.nombre) return 'Sin asignar'
  return `${row.apellido ?? ''}, ${row.nombre ?? ''}`
    .trim()
    .replace(/^,\s*/, '')
    .replace(/,\s*$/, '')
}

function validateParams(params) {
  const { modo } = params || {}
  if (modo !== 'mensual' && modo !== 'rango') {
    return {
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'modo debe ser "mensual" o "rango"' }
    }
  }
  if (modo === 'mensual') {
    const anio = Number(params.anio)
    const mes = Number(params.mes)
    if (!Number.isInteger(anio) || anio < 2000 || anio > 9999) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'anio inválido' } }
    }
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'mes debe estar entre 1 y 12' }
      }
    }
    return { ok: true }
  }
  const { desde, hasta } = params
  const re = /^\d{4}-\d{2}-\d{2}$/
  if (!re.test(desde) || !re.test(hasta)) {
    return {
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'desde y hasta deben tener formato YYYY-MM-DD' }
    }
  }
  if (desde > hasta) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'la fecha "desde" no puede ser posterior a "hasta"'
      }
    }
  }
  return { ok: true }
}

function buildPeriodInfo(params) {
  if (params.modo === 'mensual') {
    const anio = Number(params.anio)
    const mes = Number(params.mes)
    const label = `${MESES[mes - 1]} ${anio}`
    const filename = `reporte-pagos-${anio}-${pad2(mes)}.pdf`
    return { label, filename }
  }
  const label = `${formatDdMmYyyy(params.desde)} al ${formatDdMmYyyy(params.hasta)}`
  const filename = `reporte-pagos-${compactDate(params.desde)}-${compactDate(params.hasta)}.pdf`
  return { label, filename }
}

function buildPdfDoc(rows, info) {
  const tableHeader = [
    { text: 'Nombre y Apellido', bold: true },
    { text: 'DNI', bold: true },
    { text: 'Tipo', bold: true },
    { text: 'Monto', bold: true, alignment: 'right' }
  ]

  const subtotales = { paciente: 0, alumno: 0, alumno_particular: 0 }
  let totalGeneral = 0
  for (const r of rows) {
    if (r.rol_tipo && subtotales[r.rol_tipo] != null) {
      subtotales[r.rol_tipo] += Number(r.monto) || 0
    }
    totalGeneral += Number(r.monto) || 0
  }

  const tableBody = [
    tableHeader,
    ...rows.map((r) => [
      personaLabel(r),
      r.dni ?? '—',
      r.rol_tipo ? (TIPO_LABEL[r.rol_tipo] ?? '—') : '—',
      { text: formatMonto(r.monto), alignment: 'right' }
    ])
  ]

  const content = [
    { text: `Reporte de pagos — ${info.label}`, fontSize: 18, bold: true },
    {
      text: `Generado el ${fechaGeneradoString()}`,
      fontSize: 10,
      color: '#666666',
      margin: [0, 2, 0, 12]
    }
  ]

  if (rows.length === 0) {
    content.push({
      text: 'No se registraron pagos en el período indicado.',
      italics: true,
      margin: [0, 12, 0, 0]
    })
  } else {
    content.push({
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto', 'auto'],
        body: tableBody
      },
      layout: 'lightHorizontalLines'
    })
    content.push({ text: 'Subtotales', bold: true, margin: [0, 16, 0, 4] })
    content.push({ text: `Total Pacientes: ${formatMonto(subtotales.paciente)}` })
    content.push({ text: `Total Alumnos grupales: ${formatMonto(subtotales.alumno)}` })
    content.push({
      text: `Total Alumnos particulares: ${formatMonto(subtotales.alumno_particular)}`
    })
    content.push({
      text: `Total: ${formatMonto(totalGeneral)}`,
      bold: true,
      fontSize: 13,
      margin: [0, 12, 0, 0]
    })
  }

  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    content
  }
}

export function registerReportesHandlers(db) {
  const listMensualStmt = db.prepare(`
    SELECT
      p.id,
      p.fecha_pago,
      p.monto,
      p.rol_tipo,
      pe.nombre,
      pe.apellido,
      pe.dni
    FROM pagos p
    LEFT JOIN personas pe ON pe.id = p.persona_id
    WHERE p.estado = 'confirmado'
      AND p.origen != 'efectivo'
      AND p.fecha_pago BETWEEN printf('%04d-%02d-01', ?, ?) AND printf('%04d-%02d-31', ?, ?)
    ORDER BY pe.apellido ASC, pe.nombre ASC
  `)

  const listRangoStmt = db.prepare(`
    SELECT
      p.id,
      p.fecha_pago,
      p.monto,
      p.rol_tipo,
      pe.nombre,
      pe.apellido,
      pe.dni
    FROM pagos p
    LEFT JOIN personas pe ON pe.id = p.persona_id
    WHERE p.estado = 'confirmado'
      AND p.origen != 'efectivo'
      AND p.fecha_pago BETWEEN ? AND ?
    ORDER BY pe.apellido ASC, pe.nombre ASC
  `)

  const smtpKeysStmt = db.prepare(
    "SELECT clave, valor FROM configuracion WHERE clave IN ('smtp_host','smtp_port','smtp_user','smtp_pass','mail_contador')"
  )

  function consultarPagos(params) {
    if (params.modo === 'mensual') {
      const anio = Number(params.anio)
      const mes = Number(params.mes)
      return listMensualStmt.all(anio, mes, anio, mes)
    }
    return listRangoStmt.all(params.desde, params.hasta)
  }

  async function generarPdfBuffer(params) {
    const rows = consultarPagos(params)
    const info = buildPeriodInfo(params)
    const docDefinition = buildPdfDoc(rows, info)
    const pdf = pdfmake.createPdf(docDefinition)
    const buffer = await pdf.getBuffer()
    return { buffer, info }
  }

  function leerConfigSMTP() {
    const rows = smtpKeysStmt.all()
    const map = new Map(rows.map((r) => [r.clave, r.valor ?? '']))
    return {
      host: map.get('smtp_host') ?? '',
      port: map.get('smtp_port') ?? '',
      user: map.get('smtp_user') ?? '',
      pass: decryptIfSensitive('smtp_pass', map.get('smtp_pass') ?? ''),
      contador: map.get('mail_contador') ?? ''
    }
  }

  ipcMain.handle('reportes:generar', async (_e, params) => {
    const v = validateParams(params)
    if (!v.ok) return v

    let buffer, info
    try {
      ;({ buffer, info } = await generarPdfBuffer(params))
    } catch (err) {
      return { ok: false, error: { code: 'PDF_FAILED', message: err.message } }
    }

    let saveResult
    try {
      const win = BrowserWindow.getFocusedWindow()
      const defaultPath = path.join(app.getPath('downloads'), info.filename)
      saveResult = await dialog.showSaveDialog(win ?? undefined, {
        defaultPath,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
    } catch (err) {
      return { ok: false, error: { code: 'DIALOG_FAILED', message: err.message } }
    }

    if (saveResult.canceled || !saveResult.filePath) {
      return { ok: true, data: { cancelado: true } }
    }

    try {
      await fs.writeFile(saveResult.filePath, buffer)
      return { ok: true, data: { cancelado: false, path: saveResult.filePath } }
    } catch (err) {
      return { ok: false, error: { code: 'WRITE_FAILED', message: err.message } }
    }
  })

  ipcMain.handle('reportes:enviar-mail', async (_e, params) => {
    const v = validateParams(params)
    if (!v.ok) return v

    const cfg = leerConfigSMTP()
    if (!cfg.host || !cfg.port || !cfg.user || !cfg.pass || !cfg.contador) {
      return {
        ok: false,
        error: {
          code: 'SMTP_NO_CONFIGURADO',
          message:
            'Faltan datos de SMTP o el mail del contador. Configurálos en Ajustes antes de enviar reportes.'
        }
      }
    }

    let buffer, info
    try {
      ;({ buffer, info } = await generarPdfBuffer(params))
    } catch (err) {
      return { ok: false, error: { code: 'PDF_FAILED', message: err.message } }
    }

    const portNum = Number(cfg.port)
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: portNum,
      secure: portNum === 465,
      auth: { user: cfg.user, pass: cfg.pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000
    })

    try {
      await transporter.sendMail({
        from: cfg.user,
        to: cfg.contador,
        subject: `Reporte de pagos — ${info.label}`,
        text: `Adjunto el reporte de pagos del período ${info.label}.`,
        attachments: [{ filename: info.filename, content: buffer }]
      })
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: { code: 'SMTP_ERROR', message: err.message } }
    } finally {
      try {
        transporter.close()
      } catch {
        /* ignore close errors */
      }
    }
  })
}
