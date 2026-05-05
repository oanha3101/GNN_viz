import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import App from './App'

const authState = {
  user: null,
  token: null,
  verifyToken: vi.fn(() => Promise.resolve(true)),
}

vi.mock('./store/authStore', () => {
  const useAuthStore = (selector) => selector(authState)
  useAuthStore.getState = () => authState
  return { default: useAuthStore }
})

vi.mock('./pages/AuthPage', () => ({
  default: ({ mode }) => <div>auth-page:{mode}</div>,
}))

vi.mock('./pages/app/DashboardPage', () => ({
  default: () => <div>dashboard-page</div>,
}))

vi.mock('./pages/app/ProjectsPage', () => ({
  default: () => <div>projects-page</div>,
}))

vi.mock('./pages/app/DatasetsPage', () => ({
  default: () => <div>datasets-page</div>,
}))

vi.mock('./pages/admin/AdminOverviewPage', () => ({
  default: () => <div>admin-overview-page</div>,
}))

vi.mock('./pages/admin/AdminUsersPage', () => ({
  default: () => <div>admin-users-page</div>,
}))

vi.mock('./pages/admin/AdminDatasetsPage', () => ({
  default: () => <div>admin-datasets-page</div>,
}))

vi.mock('./pages/admin/AdminExperimentsPage', () => ({
  default: () => <div>admin-experiments-page</div>,
}))

vi.mock('./pages/admin/AdminSessionsPage', () => ({
  default: () => <div>admin-sessions-page</div>,
}))

vi.mock('./pages/admin/AdminRetentionPage', () => ({
  default: () => <div>admin-retention-page</div>,
}))

vi.mock('./pages/admin/AdminAuditPage', () => ({
  default: () => <div>admin-audit-page</div>,
}))

vi.mock('./components/Library/ExperimentHub', () => ({
  default: () => <div>experiment-hub</div>,
}))

vi.mock('./LabShell', () => ({
  default: () => <div>lab-shell</div>,
}))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderApp(initialEntries) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <App />
      <LocationProbe />
    </MemoryRouter>
  )
}

describe('App routing', () => {
  beforeEach(() => {
    authState.user = null
    authState.token = null
    authState.verifyToken = vi.fn(() => Promise.resolve(true))
  })

  it('redirects anonymous users to /login', async () => {
    renderApp(['/app/lab'])

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/login')
    })
    expect(await screen.findByText('auth-page:login', {}, { timeout: 3000 })).toBeInTheDocument()
  })

  it('sends admins to /admin/overview after login', async () => {
    authState.user = { id: 1, role: 'admin', username: 'admin' }
    authState.token = 'token'

    renderApp(['/'])

    await waitFor(() => {
      expect(screen.getByText('admin-overview-page')).toBeInTheDocument()
      expect(screen.getByTestId('location')).toHaveTextContent('/admin/overview')
    })
  })

  it('keeps researchers out of admin routes', async () => {
    authState.user = { id: 2, role: 'researcher', username: 'researcher' }
    authState.token = 'token'

    renderApp(['/admin/users'])

    await waitFor(() => {
      expect(screen.getByText('dashboard-page')).toBeInTheDocument()
      expect(screen.getByTestId('location')).toHaveTextContent('/app/dashboard')
    })
  })

  it('opens the lab route inside the protected app namespace', async () => {
    authState.user = { id: 3, role: 'viewer', username: 'viewer' }
    authState.token = 'token'

    renderApp(['/app/lab'])

    await waitFor(() => {
      expect(screen.getByText('lab-shell')).toBeInTheDocument()
      expect(screen.getByTestId('location')).toHaveTextContent('/app/lab')
    })
  })
})
