/**
 * Regresa la fecha de HOY en formato YYYY-MM-DD, usando la zona horaria
 * LOCAL de la máquina donde corre el proceso (no UTC).
 *
 * Usamos el locale "en-CA" como truco porque casualmente formatea fechas
 * como YYYY-MM-DD por defecto, que es justo el formato que ya usamos en
 * toda la base de datos.
 */
export function getTodayLocal(): string {
  return new Date().toLocaleDateString("en-CA");
}