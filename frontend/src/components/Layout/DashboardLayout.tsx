import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/store/AuthContext'
import { useTheme } from '@/store/ThemeContext'
import { useSocket } from '@/store/SocketContext'
import { api } from '@/api/client'
import type { NotificationItem } from '@/types'
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useKeyboardShortcuts } from '@/utils/useKeyboardShortcuts'
import { useSocketInvalidation } from '@/hooks/useSocketInvalidation'
import OnboardingWizard, { isOnboardingDone } from '@/components/common/OnboardingWizard'

const standardNavItems = [
  { label: 'Zadania', path: '/', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { label: 'Dziś', path: '/today', icon: 'M8 7V3m8 4V3m-9 8h10m-8 4h4m-8 6h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { label: 'Projekty', path: '/projects', icon: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z' },
  { label: 'Kanban', path: '/kanban', icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2' },
  { label: 'Statystyki', path: '/dashboard', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { label: 'Kalendarz', path: '/calendar', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { label: 'Aktywność', path: '/activity', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
];

const superAdminNavItems = [
  { label: 'Zespoły', path: '/admin/teams', icon: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m10-3.13a4 4 0 10-8 0 4 4 0 008 0zM7 11a4 4 0 100-8 4 4 0 000 8z' },
  { label: 'Audyt', path: '/admin/audit', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
];

const managerNavItems = [
  { label: 'Członkowie zespołu', path: '/team/members', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  { label: 'Zaproszenia', path: '/team/invites', icon: 'M16 12H8m8 0l-4-4m4 4l-4 4m8 4H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v6' },
];

export default function DashboardLayout() {
  const { user, loading: authLoading, logout, logoutAll } = useAuth();
  const { dark, toggle } = useTheme();
  const { connected, lastNotification } = useSocket();
  const navigate = useNavigate();

  // Wire up Socket.IO → React Query cache invalidation
  useSocketInvalidation();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const canUseNotifications = user?.role !== 'super_admin';
  const navItems = user?.role === 'super_admin'
    ? superAdminNavItems
    : user?.role === 'manager'
      ? [...standardNavItems, ...managerNavItems]
      : standardNavItems;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [versionInfo, setVersionInfo] = useState<{ version: string } | null>(null)
  const notificationButtonRef = useRef<HTMLButtonElement | null>(null)
  const [notificationPanelStyle, setNotificationPanelStyle] = useState<CSSProperties>({
    left: 16,
    top: 64,
    width: 360,
  })

  // Show onboarding wizard for manager users on first login
  useEffect(() => {
    if (authLoading || !user) return
    if (user.role === 'manager' && !isOnboardingDone()) {
      setShowOnboarding(true)
    }
  }, [authLoading, user])

  useKeyboardShortcuts({
    onNewTask: () => {
      // Navigate to tasks page which has the "new task" button
      navigate('/')
      // Focus is on the page; user clicks the button
    },
    onSearchFocus: () => {
      const input = document.getElementById('task-search-input')
      if (input) {
        input.focus()
      } else {
        navigate('/')
      }
    },
    onShowHelp: () => setShowShortcuts(prev => !prev),
  })

  useEffect(() => {
    api.version().then(setVersionInfo).catch(() => setVersionInfo({ version: '?' }))
  }, [])

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

  const loadNotifications = useCallback(async () => {
    if (!canUseNotifications) {
      setNotifications([])
      setUnreadCount(0)
      return
    }
    try {
      const response = await api.notifications.getAll(20)
      setNotifications(response.notifications)
      setUnreadCount(response.unread_count)
    } catch {
      setNotifications([])
      setUnreadCount(0)
    }
  }, [canUseNotifications])

  useEffect(() => {
    void loadNotifications()
  }, [loadNotifications])

  useEffect(() => {
    if (!canUseNotifications || !lastNotification || lastNotification.user_id !== user?.id) return
    setNotifications(prev => [lastNotification, ...prev.filter(item => item.id !== lastNotification.id)].slice(0, 20))
    setUnreadCount(prev => prev + (lastNotification.read ? 0 : 1))
  }, [canUseNotifications, lastNotification, user?.id])

  const updateNotificationPanelPosition = useCallback(() => {
    const button = notificationButtonRef.current
    if (!button || typeof window === 'undefined') return

    const viewportPadding = 16
    const panelWidth = Math.min(360, window.innerWidth - viewportPadding * 2)
    const rect = button.getBoundingClientRect()
    const centeredLeft = rect.left + rect.width / 2 - panelWidth / 2
    const maxLeft = window.innerWidth - panelWidth - viewportPadding
    const left = Math.min(Math.max(viewportPadding, centeredLeft), maxLeft)

    setNotificationPanelStyle({
      left,
      top: rect.bottom + 8,
      width: panelWidth,
    })
  }, [])

  useEffect(() => {
    if (!notificationsOpen) return

    updateNotificationPanelPosition()
    window.addEventListener('resize', updateNotificationPanelPosition)
    window.addEventListener('scroll', updateNotificationPanelPosition, true)

    return () => {
      window.removeEventListener('resize', updateNotificationPanelPosition)
      window.removeEventListener('scroll', updateNotificationPanelPosition, true)
    }
  }, [notificationsOpen, updateNotificationPanelPosition])

  const markNotificationRead = async (notification: NotificationItem) => {
    if (notification.read) return
    try {
      const updated = await api.notifications.markRead(notification.id)
      setNotifications(prev => prev.map(item => (item.id === updated.id ? updated : item)))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch {
      // Keep the dropdown quiet; the next refresh will reconcile the state.
    }
  }

  const markAllNotificationsRead = async () => {
    try {
      await api.notifications.markAllRead()
      setNotifications(prev => prev.map(item => ({ ...item, read: true })))
      setUnreadCount(0)
    } catch {
      // Keep the dropdown quiet; the next refresh will reconcile the state.
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform border-r border-border bg-white transition-transform dark:bg-gray-900 md:relative md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center border-b border-border px-6">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              {user?.role === 'super_admin' ? 'Administracja' : 'Zadania'}
            </h1>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-4">
            {navItems.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                  }`
                }
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                {user?.username.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{user?.username}</p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {roleLabel(user?.role)}
                </p>
              </div>
              <NavLink
                to="/settings"
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Ustawienia"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </NavLink>
              <button
                onClick={() => void logoutAll()}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                title="Wyloguj ze wszystkich urządzeń"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
              </button>
            </div>
            <div className="mt-2 border-t border-border/50 pt-2 text-[10px] text-gray-400 dark:text-gray-500">
              {versionInfo ? `v${versionInfo.version}` : '…'}
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b border-border bg-white px-4 dark:bg-gray-900 sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="btn btn-ghost md:hidden"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            {/* Connection indicator */}
            <div className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} title={connected ? 'Połączono' : 'Rozłączono'} />

            {canUseNotifications && (
            <div className="relative">
              <button
                ref={notificationButtonRef}
                onClick={() => {
                  updateNotificationPanelPosition()
                  setNotificationsOpen(prev => !prev)
                  if (!notificationsOpen) void loadNotifications()
                }}
                className="btn btn-ghost btn-sm relative"
                title="Powiadomienia"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 01-6 0" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-destructive px-1.5 text-[10px] font-semibold leading-[18px] text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="fixed z-[80] rounded-lg border border-border bg-card shadow-xl" style={notificationPanelStyle}>
                  <div className="flex items-center justify-between gap-3 border-b border-border p-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Powiadomienia</p>
                      <p className="text-xs text-muted-foreground">{unreadCount} nieprzeczytane</p>
                    </div>
                    <button
                      onClick={() => void markAllNotificationsRead()}
                      disabled={unreadCount === 0}
                      className="text-xs font-medium text-primary disabled:text-muted-foreground"
                    >
                      Oznacz wszystkie
                    </button>
                  </div>

                  <div className="max-h-96 overflow-y-auto p-2">
                    {notifications.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                        Brak powiadomień.
                      </div>
                    ) : (
                      notifications.map(notification => (
                        <button
                          key={notification.id}
                          onClick={() => void markNotificationRead(notification)}
                          className={`mb-2 w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/50 ${
                            notification.read ? 'border-border bg-background' : 'border-primary/30 bg-primary/5'
                          }`}
                        >
                          <div className="mb-1 flex items-start justify-between gap-3">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{notificationTitle(notification.type)}</p>
                            {!notification.read && <span className="mt-1 h-2 w-2 rounded-full bg-primary" />}
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300">{notification.message}</p>
                          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                            <span className="truncate">{notification.task?.title ?? notification.actor ?? 'System'}</span>
                            <span>{notification.created_at ? formatNotificationTime(notification.created_at) : ''}</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            )}

            {/* Theme toggle */}
            <button onClick={() => setShowShortcuts(true)} className="btn btn-ghost btn-sm" title="Skróty klawiszowe (?) " >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
              </svg>
            </button>

            <button onClick={toggle} className="btn btn-ghost btn-sm" title="Przełącz motyw">
              {dark ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* Logout */}
            <button onClick={handleLogout} className="btn btn-ghost btn-sm text-destructive hover:text-destructive">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </header>

        {/* Onboarding wizard overlay for first-login managers */}
        {showOnboarding && (
          <OnboardingWizard onDone={() => setShowOnboarding(false)} />
        )}

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </main>

        {/* Keyboard shortcuts help dialog */}
        {showShortcuts && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowShortcuts(false)}
            onKeyDown={e => e.key === 'Escape' && setShowShortcuts(false)}
          >
            <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Skróty klawiszowe</h3>
                <button onClick={() => setShowShortcuts(false)} className="btn btn-ghost btn-sm">✕</button>
              </div>
              <div className="space-y-3">
                <ShortcutRow keys="Ctrl+K" action="Paleta komend" />
                <ShortcutRow keys="g → d" action="Statystyki" />
                <ShortcutRow keys="g → t" action="Zadania" />
                <ShortcutRow keys="g → k" action="Kanban" />
                <ShortcutRow keys="g → c" action="Kalendarz" />
                <ShortcutRow keys="g → p" action="Projekty" />
                <ShortcutRow keys="g → a" action="Aktywność" />
                <ShortcutRow keys="n" action="Nowe zadanie" />
                <ShortcutRow keys="/" action="Szukaj" />
                <ShortcutRow keys="?" action="Pokaż skróty" />
              </div>
              <button onClick={() => setShowShortcuts(false)} className="btn btn-primary mt-4 w-full btn-sm">Zamknij</button>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="border-t border-gray-200 dark:border-gray-800 px-4 py-3 text-center text-xs text-gray-500 dark:text-gray-400">
          © 2026 Krzysztof Graczyk. Wszelkie prawa zastrzeżone.
          <span className="mx-2">·</span>
          <a href="/privacy.html" target="_blank" rel="noreferrer" className="hover:text-teal-600 dark:hover:text-teal-400">Prywatność</a>
          <span className="mx-2">·</span>
          <a href="/terms.html" target="_blank" rel="noreferrer" className="hover:text-teal-600 dark:hover:text-teal-400">Regulamin</a>
        </footer>
      </div>
    </div>
  );
}

function roleLabel(role: string | undefined) {
  if (role === 'super_admin') return 'Super Admin'
  if (role === 'manager') return 'Administrator'
  return 'Użytkownik'
}

function notificationTitle(type: string) {
  return ({
    assignment: 'Przypisanie',
    mention: 'Wzmianka',
    unblocked: 'Odblokowano',
  }[type] || 'Powiadomienie')
}

function ShortcutRow({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-gray-900 dark:text-white">{action}</span>
      <kbd className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground shadow-sm">{keys}</kbd>
    </div>
  )
}

function formatNotificationTime(value: string) {
  return new Date(value).toLocaleString('pl-PL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
