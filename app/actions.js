'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { recordSale } from '../lib/db'

export async function createSale(formData) {
  const productId = Number(formData.get('productId'))
  const quantity = Number(formData.get('quantity'))

  if (!Number.isInteger(productId) || productId < 1 || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1000) {
    redirect('/panel?error=Revisa+el+producto+y+la+cantidad')
  }

  recordSale(productId, Math.round(quantity * 100) / 100)
  revalidatePath('/')
  revalidatePath('/panel')
  redirect('/panel?success=Venta+registrada')
}
