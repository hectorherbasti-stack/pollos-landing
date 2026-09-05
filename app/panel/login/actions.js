'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { PANEL_COOKIE, hashPassword } from '../../../lib/panelAuth'

export async function login(formData) {
  const password = formData.get('password')
  const next = formData.get('next') || '/panel'
  const expectedPassword = process.env.PANEL_PASSWORD

  if (!expectedPassword) {
    redirect('/panel/login?error=El+panel+no+tiene+PANEL_PASSWORD+configurada')
  }
  if (password !== expectedPassword) {
    redirect(`/panel/login?error=Contrase%C3%B1a+incorrecta&next=${encodeURIComponent(next)}`)
  }

  const cookieStore = await cookies()
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
  const cookieStore = await cookies()
  cookieStore.delete(PANEL_COOKIE)
  redirect('/panel/login')
}
