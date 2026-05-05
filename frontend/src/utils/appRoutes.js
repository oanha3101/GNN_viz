export function normalizePath(path = '/') {
  if (!path) return '/'
  const trimmed = path.trim()
  if (!trimmed || trimmed === '/') return '/'
  return trimmed.endsWith('/') && trimmed.length > 1 ? trimmed.slice(0, -1) : trimmed
}

export function isAdminUser(user) {
  return !!user && user.role === 'admin'
}

export function getDefaultPathForUser(user) {
  if (!user) return '/login'
  return isAdminUser(user) ? '/admin/overview' : '/app/dashboard'
}

export function resolveAppRoute(pathname, user) {
  const path = normalizePath(pathname)

  if (!user) {
    if (path === '/login' || path === '/register') {
      return { redirect: path, section: 'public' }
    }
    return { redirect: '/login', section: 'public' }
  }

  if (path === '/' || path === '/login' || path === '/register') {
    const redirect = getDefaultPathForUser(user)
    return {
      redirect,
      section: redirect.startsWith('/admin') ? 'admin' : 'app',
    }
  }

  if (path.startsWith('/admin')) {
    if (!isAdminUser(user)) {
      return { redirect: '/app/dashboard', section: 'app' }
    }
    return { redirect: path, section: 'admin' }
  }

  if (path.startsWith('/app')) {
    return { redirect: path, section: 'app' }
  }

  const redirect = getDefaultPathForUser(user)
  return {
    redirect,
    section: redirect.startsWith('/admin') ? 'admin' : 'app',
  }
}
