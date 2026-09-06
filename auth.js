// Función principal que configura autenticación y genera utilidades del servidor.
import NextAuth from 'next-auth'
// Proveedor OAuth: delega identidad y contraseña a Google.
import Google from 'next-auth/providers/google'
// Adaptador que traduce las operaciones de Auth.js a consultas PostgreSQL.
import PostgresAdapter from '@auth/pg-adapter'
// Compartimos el mismo pool y la inicialización con el resto del negocio.
import { getPool, ensureDatabase } from './lib/db'

// NextAuth devuelve los handlers HTTP y funciones reutilizables en Server Components.
export const {
  // GET y POST se reexportan desde app/api/auth/[...nextauth]/route.js.
  handlers: { GET, POST },
  // auth() devuelve la sesión actual dentro de componentes del servidor.
  auth,
  // signIn() inicia OAuth; signOut() elimina la sesión.
  signIn,
  signOut,
} = NextAuth(async () => {
  // Antes de autenticar, garantizamos que existan las tablas de Auth.js.
  await ensureDatabase()
  return {
    // El adaptador persiste usuarios, cuentas y sesiones en el mismo PostgreSQL.
    adapter: PostgresAdapter(getPool()),
    // Google OAuth requiere AUTH_GOOGLE_ID y AUTH_GOOGLE_SECRET en el entorno.
    providers: [Google],
    // La sesión se guarda en PostgreSQL, no dentro de un JWT autocontenido.
    session: { strategy: 'database' },
    // Sustituimos la pantalla predeterminada por nuestra página con diseño propio.
    pages: { signIn: '/ingresar' },
    // Los callbacks permiten ampliar los datos que recibe la interfaz.
    callbacks: {
      session({ session, user }) {
        // Añadimos el rol almacenado en la BD al objeto de sesión usado por la UI.
        session.user.role = user.role
        // Siempre hay que devolver session para que NextAuth envíe el objeto modificado.
        return session
      },
    },
  }
})
