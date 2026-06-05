const ILLUSTRATIONS = {
  tasks: (
    <svg className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 64 64" stroke="currentColor" strokeWidth={0.8}>
      <rect x="8" y="8" width="20" height="6" rx="2" stroke="currentColor" fill="none" />
      <rect x="8" y="20" width="48" height="6" rx="2" stroke="currentColor" fill="none" />
      <rect x="8" y="32" width="36" height="6" rx="2" stroke="currentColor" fill="none" />
      <rect x="8" y="44" width="42" height="6" rx="2" stroke="currentColor" fill="none" />
      <circle cx="52" cy="47" r="8" stroke="currentColor" fill="none" strokeWidth={1.2} />
      <path d="M49 47l2 2 4-4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  search: (
    <svg className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 64 64" stroke="currentColor" strokeWidth={0.8}>
      <circle cx="28" cy="28" r="16" stroke="currentColor" fill="none" strokeWidth={1.2} />
      <path d="M40 40l12 12" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <path d="M22 22l12 12M34 22l-12 12" stroke="currentColor" strokeWidth={1} strokeLinecap="round" opacity={0.5} />
    </svg>
  ),
  projects: (
    <svg className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 64 64" stroke="currentColor" strokeWidth={0.8}>
      <rect x="8" y="8" width="48" height="12" rx="3" stroke="currentColor" fill="none" />
      <path d="M8 20l48 0" stroke="currentColor" strokeWidth={0.5} opacity={0.3} />
      <rect x="8" y="26" width="48" height="8" rx="2" stroke="currentColor" fill="none" />
      <rect x="8" y="40" width="48" height="8" rx="2" stroke="currentColor" fill="none" />
      <path d="M8 52h48" stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeDasharray="4 3" opacity={0.4} />
    </svg>
  ),
  calendar: (
    <svg className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 64 64" stroke="currentColor" strokeWidth={0.8}>
      <rect x="8" y="14" width="48" height="42" rx="4" stroke="currentColor" fill="none" />
      <rect x="8" y="14" width="48" height="12" rx="4" stroke="currentColor" fill="none" />
      <line x1="20" y1="8" x2="20" y2="20" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
      <line x1="44" y1="8" x2="44" y2="20" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
      <circle cx="22" cy="32" r="2" fill="currentColor" opacity={0.2} />
      <circle cx="32" cy="32" r="2" fill="currentColor" opacity={0.2} />
      <circle cx="42" cy="32" r="2" fill="currentColor" opacity={0.2} />
      <circle cx="22" cy="42" r="2" fill="currentColor" opacity={0.2} />
      <circle cx="32" cy="42" r="2" fill="currentColor" opacity={0.2} />
      <circle cx="42" cy="42" r="2" fill="currentColor" opacity={0.2} />
    </svg>
  ),
  kanban: (
    <svg className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 64 64" stroke="currentColor" strokeWidth={0.8}>
      <rect x="4" y="8" width="17" height="44" rx="3" stroke="currentColor" fill="none" />
      <rect x="24" y="8" width="17" height="44" rx="3" stroke="currentColor" fill="none" />
      <rect x="44" y="8" width="17" height="44" rx="3" stroke="currentColor" fill="none" />
      <rect x="8" y="14" width="10" height="4" rx="1" fill="currentColor" opacity={0.15} />
      <rect x="28" y="14" width="10" height="4" rx="1" fill="currentColor" opacity={0.15} />
      <rect x="48" y="14" width="10" height="4" rx="1" fill="currentColor" opacity={0.15} />
    </svg>
  ),
  team: (
    <svg className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 64 64" stroke="currentColor" strokeWidth={0.8}>
      <circle cx="22" cy="22" r="10" stroke="currentColor" fill="none" strokeWidth={1.2} />
      <circle cx="46" cy="26" r="10" stroke="currentColor" fill="none" strokeWidth={1.2} />
      <path d="M12 52c0-8 4.5-14 10-14s10 6 10 14" stroke="currentColor" fill="none" strokeWidth={1.2} />
      <path d="M36 52c0-8 4.5-12 10-12s10 4 10 12" stroke="currentColor" fill="none" strokeWidth={1.2} />
      <circle cx="34" cy="22" r="4" stroke="currentColor" fill="none" opacity={0.4} />
    </svg>
  ),
  activity: (
    <svg className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 64 64" stroke="currentColor" strokeWidth={0.8}>
      <path d="M8 32l12-12 8 8 16-16 12 12" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.3} />
      <circle cx="56" cy="16" r="4" stroke="currentColor" fill="none" strokeWidth={1.2} />
      <line x1="8" y1="44" x2="28" y2="44" stroke="currentColor" strokeWidth={1} strokeLinecap="round" />
      <line x1="8" y1="52" x2="20" y2="52" stroke="currentColor" strokeWidth={1} strokeLinecap="round" />
      <line x1="8" y1="36" x2="18" y2="36" stroke="currentColor" strokeWidth={1} strokeLinecap="round" />
    </svg>
  ),
  default: (
    <svg className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 64 64" stroke="currentColor" strokeWidth={0.8}>
      <circle cx="32" cy="32" r="20" stroke="currentColor" fill="none" strokeWidth={1.2} />
      <path d="M24 32l6 6 10-12" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.5} />
    </svg>
  ),
}

type IllustrationType = keyof typeof ILLUSTRATIONS

export function EmptyState({
  type = 'default',
  title,
  description,
  action,
}: {
  type?: IllustrationType
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center transition-colors hover:border-muted-foreground/20">
      {ILLUSTRATIONS[type] ?? ILLUSTRATIONS.default}
      <p className="text-lg font-medium text-gray-500 dark:text-gray-400">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-gray-400 dark:text-gray-500">{description}</p>
      )}
      {action && (
        <div className="mt-4">{action}</div>
      )}
    </div>
  )
}


