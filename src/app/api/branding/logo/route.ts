import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  const { data: settings } = await supabase
    .from('company_settings')
    .select('logo_path')
    .eq('singleton', true)
    .single()

  if (!settings?.logo_path) {
    return NextResponse.redirect(new URL('/brand/edubridge-logo-color.svg', 'http://localhost:3000'))
  }

  const { data, error } = await supabase.storage
    .from('branding')
    .download(settings.logo_path)

  if (error || !data) {
    return NextResponse.redirect(new URL('/brand/edubridge-logo-color.svg', 'http://localhost:3000'))
  }

  const isSvg = settings.logo_path.endsWith('.svg')
  const contentType = isSvg ? 'image/svg+xml' : 'image/png'

  const arrayBuffer = await data.arrayBuffer()
  return new Response(arrayBuffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  })
}
