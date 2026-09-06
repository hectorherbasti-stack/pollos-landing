import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import PostgresAdapter from '@auth/pg-adapter'
import { getPool, ensureDatabase } from './lib/db'

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth(async () => {
  await ensureDatabase()
  return {
    adapter: PostgresAdapter(getPool()),
    providers: [Google],
    session: { strategy: 'database' },
    pages: { signIn: '/ingresar' },
    callbacks: {
      session({ session, user }) {
        session.user.role = user.role
        return session
      },
    },
  }
})
