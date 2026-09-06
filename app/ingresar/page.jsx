import { signIn } from '../../auth'

// oxlint-disable-next-line react/only-export-components -- Next.js metadata convention
export const metadata = { title: 'Iniciar sesión | Julia' }

export default async function LoginPage({ searchParams }) {
  const params = await searchParams
  const callbackUrl = params?.callbackUrl || '/'

  return (
    <main className="dashboard" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <div className="sale-form-card" style={{ width: 'min(380px, 100%)', textAlign: 'center' }}>
        <div className="panel-title">
          <p>BIENVENIDO</p>
          <h2>Ingresá para comprar</h2>
        </div>
        <p style={{ margin: '14px 0 24px', color: '#78685e', fontSize: 14 }}>
          Necesitás una cuenta para hacer pedidos. Es gratis y usás tu Google.
        </p>
        <form
          action={async () => {
            'use server'
            await signIn('google', { redirectTo: callbackUrl })
          }}
        >
          <button className="button" type="submit" style={{ width: '100%' }}>
            Continuar con Google <span>↗</span>
          </button>
        </form>
      </div>
    </main>
  )
}
