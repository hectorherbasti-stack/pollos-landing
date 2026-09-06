'use server'
// La directiva anterior garantiza que este archivo solo se ejecute en el servidor.
// El navegador recibe una referencia segura a la función, no el código de acceso a PostgreSQL.

// revalidatePath descarta una vista anterior después de modificar sus datos.
import { revalidatePath } from 'next/cache'
// redirect termina la acción y devuelve una respuesta de redirección al navegador.
import { redirect } from 'next/navigation'
// recordSale concentra la consulta SQL; la Action solo valida y coordina.
import { recordSale } from '../lib/db'

export async function createSale(formData) {
  // FormData contiene los campos enviados por el formulario de /panel.
  // Number convierte los textos del formulario a números para poder validarlos.
  const productId = Number(formData.get('productId'))
  const quantity = Number(formData.get('quantity'))

  // Nunca confiamos directamente en valores enviados desde el navegador.
  // Solo aceptamos un id entero positivo y una cantidad entre 0 y 1000.
  if (!Number.isInteger(productId) || productId < 1 || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1000) {
    redirect('/panel?error=Revisa+el+producto+y+la+cantidad')
  }

  // Redondeamos a dos decimales antes de guardar la venta en PostgreSQL.
  await recordSale(productId, Math.round(quantity * 100) / 100)
  // Invalidamos ambas rutas para que vuelvan a consultar datos actualizados.
  revalidatePath('/')
  revalidatePath('/panel')
  // PRG (Post/Redirect/Get): evita duplicar la venta al recargar el navegador.
  redirect('/panel?success=Venta+registrada')
}
