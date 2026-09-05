import { NextResponse } from 'next/server'
import { PANEL_COOKIE, hashPassword } from './lib/panelAuth'

export const config = { matcher: ['/panel/:path*'] }

export async function middleware(request) {
  if (request.nextUrl.pathname === '/panel/login') return NextResponse.next()

  const password = process.env.PANEL_PASSWORD
  const expected = password ? await hashPassword(password) : null
  const cookie = request.cookies.get(PANEL_COOKIE)?.value

  if (expected && cookie === expected) return NextResponse.next()

  const loginUrl = new URL('/panel/login', request.url)
  loginUrl.searchParams.set('next', request.nextUrl.pathname)
  return NextResponse.redirect(loginUrl)
}
