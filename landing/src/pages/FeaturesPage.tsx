import { motion } from 'framer-motion'
import FeatureShowcase from '../components/FeatureShowcase'

const features = [
  {
    title: 'Tablica Kanban',
    description:
      'Wizualne zarządzanie zadaniami metodą Kanban. Przeciągaj zadania między kolumnami, śledź postęp i reaguj na zmiany w czasie rzeczywistym.',
    bullets: [
      'Przeciąganie i upuszczanie między kolumnami: Do zrobienia, W toku, Zakończone',
      'Synchronizacja w czasie rzeczywistym przez Socket.IO — zmiany widoczne u wszystkich członków zespołu',
      'Optymistyczne aktualizacje — interfejs reaguje natychmiast, z automatycznym przywracaniem przy błędzie',
      'Odznaki priorytetów (Wysoki / Średni / Niski), avatary przypisanych osób, wskaźniki zablokowanych zadań',
    ],
    screenshotSrc: '/screenshots/kanban.webp',
    screenshotAlt: 'Zrzut ekranu: Tablica Kanban z zadaniami w 3 kolumnach',
    imageSide: 'right' as const,
  },
  {
    title: 'Dashboard i wykresy',
    description:
      'Pełny przegląd statystyk i wydajności zespołu. Wykresy, raporty i tablica zależności w jednym miejscu.',
    bullets: [
      '5 kart statystyk: łączna liczba zadań, ukończone, oczekujące, zaległe, wskaźnik ukończenia',
      'Wykres kołowy rozkładu priorytetów (Wysoki / Średni / Niski)',
      'Wykres słupkowy postępu projektów',
      'Panel raportu tygodniowego i tablica zależności między zadaniami',
    ],
    screenshotSrc: '/screenshots/dashboard.webp',
    screenshotAlt: 'Zrzut ekranu: Dashboard z wykresami i statystykami',
    imageSide: 'left' as const,
  },
  {
    title: 'Kalendarz',
    description:
      'Planuj zadania w widoku miesięcznym. Przeglądaj terminy, filtruj i zarządzaj harmonogramem całego zespołu.',
    bullets: [
      'Widok miesięczny z zadaniami naniesionymi na daty',
      'Kodowanie kolorami według priorytetu i projektu',
      'Panel boczny ze szczegółami zadania po kliknięciu',
      'Pełna integracja z pozostałymi widokami — zmiany widoczne wszędzie',
    ],
    screenshotSrc: '/screenshots/calendar.webp',
    screenshotAlt: 'Zrzut ekranu: Widok kalendarza z zadaniami',
    imageSide: 'right' as const,
  },
]

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-16 text-center"
      >
        <h1 className="text-4xl font-bold text-text sm:text-5xl">Funkcje</h1>
        <p className="mt-4 text-lg text-text-dim">
          Poznaj możliwości TaskMaster2 — narzędzia zaprojektowanego z myślą o efektywnej pracy zespołowej.
        </p>
      </motion.div>

      {/* Feature sections */}
      <div className="space-y-32">
        {features.map((feature, i) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 60 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.7, delay: i * 0.1 }}
          >
            <FeatureShowcase {...feature} />
          </motion.div>
        ))}
      </div>
    </div>
  )
}
