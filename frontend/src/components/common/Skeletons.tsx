export function TasksPageSkeleton() {
  return (
    <div className="space-y-5 page-enter">
      <div className="space-y-2">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-4 w-64" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="card p-3">
            <div className="skeleton mb-2 h-3 w-24" />
            <div className="skeleton h-7 w-16" />
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="card p-4">
            <div className="skeleton mb-3 h-5 w-3/4" />
            <div className="skeleton mb-2 h-3 w-full" />
            <div className="skeleton h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function KanbanSkeleton() {
  return (
    <div className="space-y-4 page-enter">
      <div className="skeleton h-8 w-40" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="min-h-[420px] min-w-[290px] flex-1 rounded-xl border border-border p-3">
            <div className="skeleton mb-3 h-5 w-28" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((__, itemIndex) => (
                <div key={itemIndex} className="card p-3">
                  <div className="skeleton mb-2 h-4 w-4/5" />
                  <div className="skeleton h-3 w-1/2" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CalendarSkeleton() {
  return (
    <div className="space-y-4 page-enter">
      <div className="skeleton h-8 w-44" />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card p-4">
          <div className="skeleton mb-3 h-6 w-full" />
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, index) => (
              <div key={index} className="skeleton h-20 w-full" />
            ))}
          </div>
        </div>
        <div className="card p-4">
          <div className="skeleton mb-2 h-5 w-32" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="skeleton h-16 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 page-enter">
      <div className="skeleton h-8 w-40" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="card p-4">
            <div className="skeleton mb-2 h-3 w-20" />
            <div className="skeleton h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6"><div className="skeleton h-64 w-full" /></div>
        <div className="card p-6"><div className="skeleton h-64 w-full" /></div>
      </div>
    </div>
  )
}

export function ActivitySkeleton() {
  return (
    <div className="space-y-4 page-enter">
      <div className="skeleton h-8 w-52" />
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="card p-4">
          <div className="skeleton mb-2 h-4 w-2/3" />
          <div className="skeleton h-3 w-1/3" />
        </div>
      ))}
    </div>
  )
}

export function AdminSkeleton() {
  return (
    <div className="space-y-4 page-enter">
      <div className="skeleton h-8 w-64" />
      <div className="card p-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-3 last:mb-0 last:border-b-0 last:pb-0">
            <div className="flex items-center gap-3">
              <div className="skeleton h-8 w-8 rounded-full" />
              <div>
                <div className="skeleton mb-1 h-3 w-24" />
                <div className="skeleton h-3 w-36" />
              </div>
            </div>
            <div className="skeleton h-8 w-28" />
          </div>
        ))}
      </div>
    </div>
  )
}
