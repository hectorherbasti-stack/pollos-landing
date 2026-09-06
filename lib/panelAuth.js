// Nombre único de la cookie que middleware.js busca en cada visita a /panel.
export const PANEL_COOKIE = 'panel_auth'

export async function hashPassword(password) {
  // TextEncoder transforma el texto en bytes; SubtleCrypto calcula SHA-256.
  const data = new TextEncoder().encode(password)
  const digest = await crypto.subtle.digest('SHA-256', data)
  // Convertimos cada byte a hexadecimal y unimos todo en una cadena comparable.
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
