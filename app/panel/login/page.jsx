import { login } from './actions'

// oxlint-disable-next-line react/only-export-components -- Next.js metadata convention
export const metadata = { title: 'Ingresar al panel | Julia' }

export default async function LoginPage({ searchParams }) {
  const params = await searchParams
  const next = params?.next || '/panel'

  return (
    <main className="dashboard" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <div className="sale-form-card" style={{ width: 'min(380px, 100%)' }}>
        <div className="panel-title">
          <p>ACCESO PRIVADO</p>
          <h2>Panel de Julia</h2>
        </div>
        {params?.error && <p className="form-message error">{params.error}</p>}
        <form action={login}>
          <input type="hidden" name="next" value={next} />
          <label htmlFor="password">Contraseña</label>
          <input id="password" name="password" type="password" required autoFocus />
          <button className="button" type="submit">Entrar <span>↗</span></button>
        </form>
      </div>
    </main>
  )
}
