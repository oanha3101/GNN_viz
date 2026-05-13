import { Suspense, lazy, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Agentation } from 'agentation'
import AdminLayout from './layouts/AdminLayout'
import AppLayout from './layouts/AppLayout'
import PublicAuthLayout from './layouts/PublicAuthLayout'
import useAuthStore from './store/authStore'
import { getDefaultPathForUser, isAdminUser } from './utils/appRoutes'

const AuthPage = lazy(() => import('./pages/AuthPage'))
const ExperimentsPage = lazy(() => import('./pages/ExperimentsPage'))
const LabShell = lazy(() => import('./LabShell'))
const DashboardPage = lazy(() => import('./pages/app/DashboardPage'))
const DatasetsPage = lazy(() => import('./pages/app/DatasetsPage'))
const ProjectsPage = lazy(() => import('./pages/app/ProjectsPage'))
const AdminOverviewPage = lazy(() => import('./pages/admin/AdminOverviewPage'))
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'))
const AdminDatasetsPage = lazy(() => import('./pages/admin/AdminDatasetsPage'))
const AdminExperimentsPage = lazy(() => import('./pages/admin/AdminExperimentsPage'))
const AdminSessionsPage = lazy(() => import('./pages/admin/AdminSessionsPage'))
const AdminRetentionPage = lazy(() => import('./pages/admin/AdminRetentionPage'))
const AdminAuditPage = lazy(() => import('./pages/admin/AdminAuditPage'))

function FullscreenLoader() {
  return (
    <div className="min-h-screen bg-[#0a0514] text-[#f1f0ff] flex items-center justify-center">
      <div className="inline-flex items-center gap-3 rounded-2xl border border-[rgba(168,85,247,0.15)] bg-[#0f0a1e]/70 px-5 py-4 text-sm text-[#a5a0d0]">
        <Loader2 size={16} className="animate-spin text-[#a855f7]" />
        Dang khoi tao shell san pham...
      </div>
    </div>
  )
}

function RouteLoader() {
  return (
    <div className="min-h-[320px] flex items-center justify-center">
      <div className="inline-flex items-center gap-3 rounded-2xl border border-[rgba(168,85,247,0.15)] bg-[#0f0a1e]/70 px-5 py-4 text-sm text-[#a5a0d0]">
        <Loader2 size={16} className="animate-spin text-[#a855f7]" />
        Dang tai route...
      </div>
    </div>
  )
}

function LazyRoute({ children }) {
  return <Suspense fallback={<RouteLoader />}>{children}</Suspense>
}

export default function App() {
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const verifyToken = useAuthStore((s) => s.verifyToken)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    let active = true
    if (!token) {
      setAuthReady(true)
      return () => {
        active = false
      }
    }

    setAuthReady(false)
    verifyToken()
      .catch(() => false)
      .finally(() => {
        if (active) setAuthReady(true)
      })

    return () => {
      active = false
    }
  }, [token, verifyToken])

  if (!authReady) {
    return <FullscreenLoader />
  }

  return (
    <>
    {import.meta.env.DEV && (
      <Agentation
        endpoint="http://localhost:4747"
        onSessionCreated={(sessionId) => console.log('[Agentation] session:', sessionId)}
      />
    )}
    <Routes>
      <Route element={<PublicOnlyGuard user={user} />}>
        <Route element={<PublicAuthLayout />}>
          <Route path="/login" element={<LazyRoute><AuthPage mode="login" /></LazyRoute>} />
          <Route path="/register" element={<LazyRoute><AuthPage mode="register" /></LazyRoute>} />
        </Route>
      </Route>

      <Route element={<AppGuard user={user} />}>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<LazyRoute><DashboardPage /></LazyRoute>} />
          <Route path="projects" element={<LazyRoute><ProjectsPage /></LazyRoute>} />
          <Route path="datasets" element={<LazyRoute><DatasetsPage /></LazyRoute>} />
          <Route path="experiments" element={<LazyRoute><ExperimentsPage /></LazyRoute>} />
          <Route path="lab" element={<LazyRoute><LabShell /></LazyRoute>} />
          <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
        </Route>
      </Route>

      <Route element={<AdminGuard user={user} />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<LazyRoute><AdminOverviewPage /></LazyRoute>} />
          <Route path="users" element={<LazyRoute><AdminUsersPage /></LazyRoute>} />
          <Route path="datasets" element={<LazyRoute><AdminDatasetsPage /></LazyRoute>} />
          <Route path="experiments" element={<LazyRoute><AdminExperimentsPage /></LazyRoute>} />
          <Route path="sessions" element={<LazyRoute><AdminSessionsPage /></LazyRoute>} />
          <Route path="retention" element={<LazyRoute><AdminRetentionPage /></LazyRoute>} />
          <Route path="audit" element={<LazyRoute><AdminAuditPage /></LazyRoute>} />
          <Route path="*" element={<Navigate to="/admin/overview" replace />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to={getDefaultPathForUser(user)} replace />} />
      <Route path="*" element={<Navigate to={getDefaultPathForUser(user)} replace />} />
    </Routes>
    </>
  )
}

function PublicOnlyGuard({ user }) {
  if (user) {
    return <Navigate to={getDefaultPathForUser(user)} replace />
  }
  return <Outlet />
}

function AppGuard({ user }) {
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

function AdminGuard({ user }) {
  if (!user) {
    return <Navigate to="/login" replace />
  }
  if (!isAdminUser(user)) {
    return <Navigate to="/app/dashboard" replace />
  }
  return <Outlet />
}
