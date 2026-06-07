
import type { Task } from "@/types"
import { getPolishCalendarInfo } from "@/data/polishCalendar"

const days = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"]

type CalendarDay = { day: number; weekday: number }
type CalendarWeek = { weekNumber: number; days: Array<CalendarDay | null> }

interface Props {
  year: number
  month: number
  today: Date
  selectedDay: number | null
  calendarWeeks: CalendarWeek[]
  getDayTasks: (day: number) => Task[]
  onSelectDay: (day: number) => void
  onSelectTask: (day: number, task: Task) => void
}

export default function CalendarGrid({
  year,
  month,
  today,
  selectedDay,
  calendarWeeks,
  getDayTasks,
  onSelectDay,
  onSelectTask,
}: Props) {
  return (
    <div className="card overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] sm:grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b border-border bg-muted/40">
        <div className="hidden border-r border-border py-2 text-center text-[11px] font-semibold uppercase text-muted-foreground sm:block">
          Tydz.
        </div>
        {days.map((day, index) => (
          <div
            key={day}
            className={`py-2 text-center text-xs font-semibold ${weekdayHeaderClass(index)}`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div>
        {calendarWeeks.map(week => (
          <div
            key={`${year}-${month}-${week.weekNumber}`}
            className="grid grid-cols-[repeat(7,minmax(0,1fr))] sm:grid-cols-[3rem_repeat(7,minmax(0,1fr))]"
          >
            <div className="hidden min-h-[92px] items-start justify-center border-b border-r border-border bg-muted/30 px-1 py-2 text-[11px] font-semibold text-muted-foreground sm:flex">
              {week.weekNumber}
            </div>

            {week.days.map((calendarDay, index) => {
              if (!calendarDay) {
                return (
                  <div
                    key={`empty-${week.weekNumber}-${index}`}
                    className={`min-h-[60px] sm:min-h-[92px] border-b border-r border-border ${emptyDayClass(index)}`}
                  />
                )
              }

              const dayTasks = getDayTasks(calendarDay.day)
              const isToday =
                calendarDay.day === today.getDate() &&
                month === today.getMonth() &&
                year === today.getFullYear()
              const isSelected = selectedDay === calendarDay.day
              const calendarInfo = getPolishCalendarInfo(
                new Date(year, month, calendarDay.day),
              )

              return (
                <div
                  key={calendarDay.day}
                  onClick={() => onSelectDay(calendarDay.day)}
                  onKeyDown={event => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      onSelectDay(calendarDay.day)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className={`flex min-h-[60px] sm:min-h-[92px] flex-col gap-1 border-b border-r border-border p-1 sm:p-1.5 text-left transition-colors ${dayCellClass(calendarDay.weekday, isToday, isSelected)}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${dayNumberClass(calendarDay.weekday, isToday)}`}
                    >
                      {calendarDay.day}
                    </span>
                    {calendarInfo.holidays.length > 0 && (
                      <span
                        className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                        title={calendarInfo.holidays.join(", ")}
                        aria-label={`Święto: ${calendarInfo.holidays.join(", ")}`}
                      >
                        🎉
                      </span>
                    )}
                  </div>

                  {calendarInfo.nameDays.length > 0 && (
                    <span
                      className="block truncate rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                      title={`Imieniny: ${calendarInfo.nameDays.join(", ")}`}
                    >
                      {calendarInfo.nameDays.slice(0, 2).join(", ")}
                    </span>
                  )}

                  <div className="flex flex-wrap gap-0.5 sm:hidden">
                    {dayTasks.slice(0, 4).map(task => (
                      <span
                        key={task.id}
                        className={`h-2 w-2 rounded-full ${taskDotClass(task)}`}
                      />
                    ))}
                    {dayTasks.length > 4 && (
                      <span className="text-[9px] text-muted-foreground">
                        +{dayTasks.length - 4}
                      </span>
                    )}
                  </div>
                  <div className="hidden space-y-0.5 sm:block">
                    {dayTasks.slice(0, 2).map(task => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={event => {
                          event.stopPropagation()
                          onSelectDay(calendarDay.day)
                          onSelectTask(calendarDay.day, task)
                        }}
                        className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium ${taskBadgeClass(task)}`}
                        title={task.title}
                      >
                        {task.title}
                      </button>
                    ))}
                    {dayTasks.length > 2 && (
                      <div className="text-[10px] text-muted-foreground">
                        +{dayTasks.length - 2} więcej
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export function getIsoWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNumber = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

export function buildCalendarWeeks(year: number, month: number): CalendarWeek[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startDay = (new Date(year, month, 1).getDay() + 6) % 7
  const weeks: CalendarWeek[] = []
  let currentWeek: Array<CalendarDay | null> = Array.from({ length: startDay }, () => null)

  for (let day = 1; day <= daysInMonth; day += 1) {
    const weekday = (new Date(year, month, day).getDay() + 6) % 7
    currentWeek.push({ day, weekday })

    if (currentWeek.length === 7) {
      weeks.push({
        weekNumber: getIsoWeekNumber(new Date(year, month, day)),
        days: currentWeek,
      })
      currentWeek = []
    }
  }

  if (currentWeek.length > 0) {
    const lastMonthDay = [...currentWeek].reverse().find(d => d !== null)?.day ?? daysInMonth
    weeks.push({
      weekNumber: getIsoWeekNumber(new Date(year, month, lastMonthDay)),
      days: [...currentWeek, ...Array.from({ length: 7 - currentWeek.length }, () => null)],
    })
  }

  return weeks
}

export function taskBadgeClass(task: Task): string {
  if (task.completed) return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
  if (task.priority === "high") return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
  if (task.priority === "medium") return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
}

export function taskDotClass(task: Task): string {
  if (task.completed) return "bg-green-500"
  if (task.priority === "high") return "bg-red-500"
  if (task.priority === "medium") return "bg-amber-500"
  return "bg-slate-400"
}

function weekdayHeaderClass(weekday: number): string {
  if (weekday === 5) return "bg-amber-100/80 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
  if (weekday === 6) return "bg-red-100/80 text-red-700 dark:bg-red-900/20 dark:text-red-300"
  return "text-muted-foreground"
}

function emptyDayClass(weekday: number): string {
  if (weekday === 5) return "bg-amber-50/40 dark:bg-amber-950/10"
  if (weekday === 6) return "bg-red-50/40 dark:bg-red-950/10"
  return "bg-gray-50/50 dark:bg-gray-900/30"
}

function dayCellClass(weekday: number, isToday: boolean, isSelected: boolean): string {
  if (isSelected) return "bg-primary/10 ring-1 ring-inset ring-primary/30"
  if (isToday) return "bg-primary/5 hover:bg-primary/10"
  if (weekday === 5) return "bg-amber-50/70 hover:bg-amber-100/80 dark:bg-amber-950/20 dark:hover:bg-amber-900/30"
  if (weekday === 6) return "bg-red-50/70 hover:bg-red-100/80 dark:bg-red-950/20 dark:hover:bg-red-900/30"
  return "hover:bg-muted/40"
}

function dayNumberClass(weekday: number, isToday: boolean): string {
  if (isToday) return "bg-primary text-white"
  if (weekday === 5) return "text-amber-700 dark:text-amber-300"
  if (weekday === 6) return "text-red-700 dark:text-red-300"
  return "text-gray-700 dark:text-gray-300"
}
