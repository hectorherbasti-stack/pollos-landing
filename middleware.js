// NextResponse permite continuar o redirigir antes de renderizar una página.
import { NextResponse } from 'next/server'
// Reutilizamos exactamente el mismo nombre de cookie y algoritmo que el login.
import { PANEL_COOKIE, hashPassword } from './lib/panelAuth'

// El matcher evita ejecutar esta comprobación en la portada, imágenes y API.
export const config = { matcher: ['/panel/:path*'] }

export async function middleware(request) {
  // La pantalla de login debe ser pública para evitar un bucle de redirecciones.
  if (request.nextUrl.pathname === '/panel/login') return NextResponse.next()

  // Calculamos el valor esperado y leemos la cookie enviada por el navegador.
  const password = process.env.PANEL_PASSWORD
  // Sin contraseña configurada, expected queda null y nadie obtiene acceso accidental.
  const expected = password ? await hashPassword(password) : null
  // ?.value devuelve undefined de forma segura cuando la cookie no existe.
  const cookie = request.cookies.get(PANEL_COOKIE)?.value

  // Coincidencia válida: la petición puede continuar hacia la página solicitada.
  if (expected && cookie === expected) return NextResponse.next()

  // Sin credenciales válidas, redirigimos al login conservando la ruta original.
  // Usamos request.url como base para conservar dominio, protocolo y puerto actuales.
  const loginUrl = new URL('/panel/login', request.url)
  // El parámetro next permitirá volver a la página originalmente solicitada.
  loginUrl.searchParams.set('next', request.nextUrl.pathname)
  return NextResponse.redirect(loginUrl)
}
