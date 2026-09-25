import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { PANEL_COOKIE, hashPassword } from '../panelAuth'

export async function requirePanel() {
  const password = process.env.PANEL_PASSWORD
  const cookie = (await cookies()).get(PANEL_COOKIE)?.value
  if (!password || cookie !== await hashPassword(password)) redirect('/panel/login')
}
