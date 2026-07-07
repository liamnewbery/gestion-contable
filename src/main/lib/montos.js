// Lógica compartida de cálculo de montos mensuales según precio y frecuencia.
// Usada por el dashboard (Inicio) y por los reportes (resumen de clientes) para
// que la fórmula de precios no se duplique ni se desincronice.

export function lunesEnMes(anio, mes) {
  let count = 0
  const ultimoDia = new Date(anio, mes, 0).getDate()
  for (let d = 1; d <= ultimoDia; d++) {
    if (new Date(anio, mes - 1, d).getDay() === 1) count++
  }
  return count
}

export function montoMes(precio, frecuencia, lunes) {
  if (precio == null) return 0
  if (frecuencia === 'mensual') return precio
  if (frecuencia === 'quincenal') return precio * 2
  if (frecuencia === 'semanal') return precio * lunes
  return 0
}
