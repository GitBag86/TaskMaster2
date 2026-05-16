import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './store/AuthContext'
import { ThemeProvider } from './store/ThemeContext'
import { ToastProvider } from './store/ToastContext'
import { SocketProvider } from './store/SocketContext'
import AuthPage from './components/Auth/AuthPage'
import DashboardLayout from './components/Layout/DashboardLayout'
import TasksPage from './components/Tasks/TasksPage'
import KanbanPage from './components/Kanban/KanbanPage'
import DashboardPage from './components/Dashboard/DashboardPage'
import CalendarPage from './components/Calendar/CalendarPage'
import ActivityPage from './components/Activity/ActivityPage'
import AdminPage from './components/Admin/AdminPage'
import { Toaster } from './components/common/Toaster'

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
        <Route path="kanban" element={<KanbanPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
          <Toaster />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
