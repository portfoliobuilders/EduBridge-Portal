import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getCelebrationsTodayCached = cache(async () => {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.rpc as any)('get_celebrations_today')
  return Array.isArray(data) ? data : []
})
