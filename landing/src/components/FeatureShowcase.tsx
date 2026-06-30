interface FeatureShowcaseProps {
  title: string
  description: string
  bullets: string[]
  screenshotSrc: string
  screenshotAlt: string
  imageSide?: 'left' | 'right'
}

export default function FeatureShowcase({
  title,
  description,
  bullets,
  screenshotSrc,
  screenshotAlt,
  imageSide = 'right',
}: FeatureShowcaseProps) {
  const content = (
    <div className="flex flex-col justify-center">
      <h2 className="mb-4 text-3xl font-bold text-text sm:text-4xl">{title}</h2>
      <p className="mb-6 text-base leading-relaxed text-text-dim">{description}</p>
      <ul className="space-y-3">
        {bullets.map((bullet, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-text-dim">
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {bullet}
          </li>
        ))}
      </ul>
      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
        Dostępne od razu po zalogowaniu
      </div>
    </div>
  )

  const image = (
    <div className="card-glow rounded-xl border border-border bg-surface p-2 shadow-xl shadow-primary/5">
      <img
        src={screenshotSrc}
        alt={screenshotAlt}
        className="w-full rounded-lg"
        loading="lazy"
      />
    </div>
  )

  return (
    <section className="grid items-center gap-12 md:grid-cols-2">
      {imageSide === 'left' ? (
        <>
          {image}
          {content}
        </>
      ) : (
        <>
          {content}
          {image}
        </>
      )}
    </section>
  )
}
