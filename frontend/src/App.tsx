import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './store/AuthContext'
import { ThemeProvider } from './store/ThemeContext'
import { ToastProvider } from './store/ToastContext'
import { SocketProvider } from './store/SocketContext'
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
          <Route index element={<TasksPage />} />
          <Route path="today" element={<TodayPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="kanban" element={<KanbanPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="admin" element={<AdminPage />} />
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
