import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './store/AuthContext'
import { ThemeProvider } from './store/ThemeContext'
import { ToastProvider } from './store/ToastContext'
import { SocketProvider } from './store/SocketContext'
import RoleRoute, { defaultPathForRole } from './components/common/RoleRoute'
const AuthPage = lazy(() => import('./components/Auth/AuthPage'))
import DashboardLayout from './components/Layout/DashboardLayout'
const TasksPage = lazy(() => import('./components/Tasks/TasksPage'))
const TodayPage = lazy(() => import('./components/Today/TodayPage'))
const ProjectsPage = lazy(() => import('./components/Projects/ProjectsPage'))
const KanbanPage = lazy(() => import('./components/Kanban/KanbanPage'))
const DashboardPage = lazy(() => import('./components/Dashboard/DashboardPage'))
const CalendarPage = lazy(() => import('./components/Calendar/CalendarPage'))
const ActivityPage = lazy(() => import('./components/Activity/ActivityPage'))
const AdminPage = lazy(() => import('./components/Admin/AdminPage'))
const TeamsAdminPage = lazy(() => import('./components/Admin/TeamsAdminPage'))
const TeamDetailPage = lazy(() => import('./components/Admin/TeamDetailPage'))
const AdminAuditPage = lazy(() => import('./components/Admin/AdminAuditPage'))
const TeamInvitesPage = lazy(() => import('./components/Team/TeamInvitesPage'))
import { Toaster } from './components/common/Toaster'
import { CommandPalette } from './components/common/CommandPalette'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/auth" replace />
  return <>{children}</>
}

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}

function AdminRedirect() {
  const { user } = useAuth()
  return <Navigate to={defaultPathForRole(user?.role)} replace />
}

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <SocketProvider>
                <DashboardLayout />
              </SocketProvider>
            </PrivateRoute>
          }
        >
          <Route index element={<RoleRoute roles={['manager', 'user']}><TasksPage /></RoleRoute>} />
          <Route path="today" element={<RoleRoute roles={['manager', 'user']}><TodayPage /></RoleRoute>} />
          <Route path="projects" element={<RoleRoute roles={['manager', 'user']}><ProjectsPage /></RoleRoute>} />
          <Route path="kanban" element={<RoleRoute roles={['manager', 'user']}><KanbanPage /></RoleRoute>} />
          <Route path="dashboard" element={<RoleRoute roles={['manager', 'user']}><DashboardPage /></RoleRoute>} />
          <Route path="calendar" element={<RoleRoute roles={['manager', 'user']}><CalendarPage /></RoleRoute>} />
          <Route path="activity" element={<RoleRoute roles={['manager', 'user']}><ActivityPage /></RoleRoute>} />
          <Route path="admin" element={<AdminRedirect />} />
          <Route path="admin/teams" element={<RoleRoute roles={['super_admin']}><TeamsAdminPage /></RoleRoute>} />
          <Route path="admin/teams/:id" element={<RoleRoute roles={['super_admin']}><TeamDetailPage /></RoleRoute>} />
          <Route path="admin/audit" element={<RoleRoute roles={['super_admin']}><AdminAuditPage /></RoleRoute>} />
          <Route path="team/members" element={<RoleRoute roles={['manager']}><AdminPage /></RoleRoute>} />
          <Route path="team/invites" element={<RoleRoute roles={['manager']}><TeamInvitesPage /></RoleRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
          <CommandPalette />
          <Toaster />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
