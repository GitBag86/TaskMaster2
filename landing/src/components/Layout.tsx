import { Link, Outlet, useLocation } from 'react-router-dom'

const navLinks = [
  { to: '/', label: 'Strona główna' },
  { to: '/features', label: 'Funkcje' },
  { to: '/contact', label: 'Kontakt' },
]

export default function Layout() {
  const { pathname } = useLocation()

  return (
    <div className="min-h-screen bg-background text-text">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 nav-blur border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
              <span className="text-sm font-bold text-primary">TM</span>
            </div>
            <span className="text-lg font-semibold text-text">TaskMaster2</span>
          </Link>

          <div className="flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  pathname === link.to ? 'text-primary' : 'text-text-dim'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="pt-16">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/20">
                <span className="text-xs font-bold text-primary">TM</span>
              </div>
              <span className="text-sm text-text-dim">TaskMaster2</span>
            </div>
            <p className="text-xs text-text-dim">
              &copy; {new Date().getFullYear()} Krzysztof Graczyk. Wszelkie prawa zastrzeżone.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="mailto:kristuff86@proton.me"
                className="text-xs text-text-dim transition-colors hover:text-primary"
              >
                kristuff86@proton.me
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
