'use server'
// Estas acciones reciben el formulario privado y administran la cookie del panel.

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { PANEL_COOKIE, hashPassword } from '../../../lib/panelAuth'

export async function login(formData) {
  // Leemos la contraseña enviada, la ruta de retorno y el secreto del servidor.
  const password = formData.get('password')
  const next = formData.get('next') || '/panel'
  const expectedPassword = process.env.PANEL_PASSWORD

  if (!expectedPassword) {
    redirect('/panel/login?error=El+panel+no+tiene+PANEL_PASSWORD+configurada')
  }
  // La comparación ocurre en el servidor; PANEL_PASSWORD nunca llega al navegador.
  if (password !== expectedPassword) {
    redirect(`/panel/login?error=Contrase%C3%B1a+incorrecta&next=${encodeURIComponent(next)}`)
  }

  const cookieStore = await cookies()
  // Guardamos un hash, no la contraseña original. httpOnly impide leerlo con JS.
  cookieStore.set(PANEL_COOKIE, await hashPassword(expectedPassword), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })

  redirect(next)
}

export async function logout() {
  // Eliminar la cookie invalida el acceso local al panel.
  const cookieStore = await cookies()
  cookieStore.delete(PANEL_COOKIE)
  redirect('/panel/login')
}
