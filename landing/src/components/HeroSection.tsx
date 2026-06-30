import { Link } from 'react-router-dom'

export default function HeroSection() {
  return (
    <section className="bg-hero-gradient flex min-h-[90vh] flex-col items-center justify-center px-6 pt-8 text-center">
      {/* Badge */}
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        Zarządzanie zadaniami w czasie rzeczywistym
      </div>

      {/* Tagline */}
      <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl">
        TaskMaster2 —{' '}
        <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          inteligentne zarządzanie zadaniami dla zespołów
        </span>
      </h1>

      {/* Subtitle */}
      <p className="mt-6 max-w-2xl text-lg text-text-dim sm:text-xl">
        Nowoczesne narzędzie do organizacji pracy zespołowej. Tablica Kanban, dashboard z wykresami,
        kalendarz i synchronizacja w czasie rzeczywistym — wszystko w jednym miejscu.
      </p>

      {/* CTA */}
      <div className="mt-10 flex flex-col gap-4 sm:flex-row">
        <Link
          to="/features"
          className="rounded-lg bg-primary px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-dark hover:shadow-xl hover:shadow-primary/30"
        >
          Zobacz funkcje
        </Link>
        <a
          href="#preview"
          className="rounded-lg border border-border bg-surface px-8 py-3 text-sm font-semibold text-text transition-all hover:bg-surface-light"
        >
          Zobacz podgląd
        </a>
      </div>

      {/* App preview screenshot */}
      <div id="preview" className="mt-16 w-full max-w-5xl">
        <div className="card-glow rounded-xl border border-border bg-surface p-2 shadow-2xl shadow-primary/5">
          <img
            src="/screenshots/tasks.webp"
            alt="Podgląd aplikacji TaskMaster2 — widok zadań"
            className="w-full rounded-lg"
            loading="lazy"
          />
        </div>
      </div>

      {/* Tech badges */}
      <div className="mt-16 flex flex-wrap items-center justify-center gap-3 pb-8">
        {['React', 'Flask', 'Socket.IO', 'PostgreSQL', 'TypeScript', 'Tailwind CSS'].map((tech) => (
          <span
            key={tech}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-dim"
          >
            {tech}
          </span>
        ))}
      </div>
    </section>
  )
}
