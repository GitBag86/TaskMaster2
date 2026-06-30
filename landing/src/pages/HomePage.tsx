import { motion } from 'framer-motion'
import HeroSection from '../components/HeroSection'
import FeatureCard from '../components/FeatureCard'

const features = [
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    ),
    title: 'Tablica Kanban',
    description: 'Przeciągaj i upuszczaj zadania między kolumnami. Synchronizacja w czasie rzeczywistym przez Socket.IO z optymistycznymi aktualizacjami.',
    link: '/features',
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    title: 'Dashboard i wykresy',
    description: 'Statystyki, wykres kołowy priorytetów, słupkowy projektów, raport tygodniowy i tablica zależności — pełny przegląd pracy zespołu.',
    link: '/features',
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
    title: 'Kalendarz',
    description: 'Widok miesięczny z zadaniami na datach, kodowanie kolorami według priorytetu, panel boczny ze szczegółami zadania.',
    link: '/features',
  },
]

export default function HomePage() {
  return (
    <div>
      <HeroSection />

      {/* Feature preview grid */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <h2 className="text-3xl font-bold text-text sm:text-4xl">
            Wszystko, czego potrzebuje Twój zespół
          </h2>
          <p className="mt-4 text-text-dim">
            Trzy kluczowe funkcje, które usprawnią codzienną pracę.
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-3">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <FeatureCard {...feature} />
            </motion.div>
          ))}
        </div>
      </section>

      {/* Tech stack section */}
      <section className="border-t border-border px-6 py-20">
        <div className="mx-auto max-w-6xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-text-dim">
              Zbudowany z
            </h3>
            <div className="flex flex-wrap items-center justify-center gap-8">
              {[
                { name: 'React', color: 'text-sky-400' },
                { name: 'TypeScript', color: 'text-blue-400' },
                { name: 'Flask', color: 'text-gray-300' },
                { name: 'Socket.IO', color: 'text-gray-300' },
                { name: 'PostgreSQL', color: 'text-cyan-400' },
                { name: 'Tailwind CSS', color: 'text-teal-400' },
              ].map((tech) => (
                <span
                  key={tech.name}
                  className={`text-lg font-semibold ${tech.color}`}
                >
                  {tech.name}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
