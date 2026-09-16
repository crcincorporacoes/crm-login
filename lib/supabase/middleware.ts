import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseEnv } from './env'
import { hasProfile } from './profile'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const { url: supabaseUrl, anonKey } = getSupabaseEnv()

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const isDashboardRoute = request.nextUrl.pathname.startsWith('/dashboard')
  const isPortalRoute = request.nextUrl.pathname.startsWith('/portal')
  const isProtectedRoute = isDashboardRoute || isPortalRoute

  let user = null
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser()
    user = fetchedUser
  } catch {
    if (!isProtectedRoute) {
      // Rota não protegida: não derruba o site inteiro por um erro
      // transitório do Supabase.
      return supabaseResponse
    }
    // Rota protegida: falha fechada — trata como não autenticado.
    user = null
  }

  const redirectTo = (pathname: string) => {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = pathname
    const redirectResponse = NextResponse.redirect(redirectUrl)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie)
    })
    return redirectResponse
  }

  if (isProtectedRoute && !user) {
    return redirectTo('/login')
  }

  if (user && isProtectedRoute) {
    const isClient = await hasProfile(supabase, user.id)
    if (isDashboardRoute && isClient) {
      return redirectTo('/portal')
    }
    if (isPortalRoute && !isClient) {
      return redirectTo('/dashboard')
    }
  }

  return supabaseResponse
}
