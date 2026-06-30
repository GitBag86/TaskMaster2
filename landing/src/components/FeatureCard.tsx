import { Link } from 'react-router-dom'

interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
  link: string
}

export default function FeatureCard({ icon, title, description, link }: FeatureCardProps) {
  return (
    <Link
      to={link}
      className="card-glow group rounded-xl border border-border bg-surface p-6 transition-all hover:-translate-y-1 hover:border-primary/30"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold text-text">{title}</h3>
      <p className="text-sm leading-relaxed text-text-dim">{description}</p>
    </Link>
  )
}
