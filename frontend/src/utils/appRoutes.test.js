import { describe, expect, it } from 'vitest'
import { getDefaultPathForUser, resolveAppRoute } from './appRoutes'

describe('appRoutes', () => {
  it('sends anonymous users to login by default', () => {
    expect(getDefaultPathForUser(null)).toBe('/login')
    expect(resolveAppRoute('/', null)).toEqual({
      redirect: '/login',
      section: 'public',
    })
  })

  it('sends admin users to the admin shell by default', () => {
    const user = { id: 1, role: 'admin' }
    expect(getDefaultPathForUser(user)).toBe('/admin/overview')
    expect(resolveAppRoute('/', user)).toEqual({
      redirect: '/admin/overview',
      section: 'admin',
    })
  })

  it('sends researcher users to the app shell by default', () => {
    const user = { id: 2, role: 'researcher' }
    expect(getDefaultPathForUser(user)).toBe('/app/dashboard')
    expect(resolveAppRoute('/', user)).toEqual({
      redirect: '/app/dashboard',
      section: 'app',
    })
  })

  it('protects app and admin paths when the user is anonymous', () => {
    expect(resolveAppRoute('/app/lab', null)).toEqual({
      redirect: '/login',
      section: 'public',
    })
    expect(resolveAppRoute('/admin/users', null)).toEqual({
      redirect: '/login',
      section: 'public',
    })
  })

  it('keeps non-admin users out of admin routes', () => {
    const user = { id: 3, role: 'researcher' }
    expect(resolveAppRoute('/admin/users', user)).toEqual({
      redirect: '/app/dashboard',
      section: 'app',
    })
  })

  it('redirects logged-in users away from public auth pages', () => {
    const user = { id: 4, role: 'viewer' }
    expect(resolveAppRoute('/login', user)).toEqual({
      redirect: '/app/dashboard',
      section: 'app',
    })
  })
})
