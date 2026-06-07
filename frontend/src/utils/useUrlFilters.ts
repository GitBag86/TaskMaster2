import { useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Syncs filter state with URL search params.
 * On mount, reads initial values from URL.
 * On change, updates URL via replaceState (no page reload).
 */
export function useUrlFilters<T extends Record<string, string>>(
  defaults: T,
): {
  filters: T
  setFilter: (key: keyof T, value: string) => void
  setFilters: (updates: Partial<T>) => void
  resetFilters: () => void
  activeCount: number
} {
  const [searchParams, setSearchParams] = useSearchParams()

  // Store defaults in a ref so they're stable
  const defaultsRef = useRef(defaults)

  // Read current values from URL, falling back to defaults
  const filters = useMemo(() => {
    const result = { ...defaultsRef.current }
    for (const key of Object.keys(result)) {
      const param = searchParams.get(key)
      if (param !== null) {
        ;(result as Record<string, string>)[key] = param
      }
    }
    return result as T
  }, [searchParams])

  const setFilter = useCallback(
    (key: keyof T, value: string) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          const defaultValue = defaultsRef.current[key]
          if (!value || value === defaultValue) {
            next.delete(key as string)
          } else {
            next.set(key as string, value)
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setFilters = useCallback(
    (updates: Partial<T>) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(updates)) {
            const defaultValue = defaultsRef.current[key as keyof T]
            if (!value || value === defaultValue) {
              next.delete(key)
            } else {
              next.set(key, value as string)
            }
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const resetFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true })
  }, [setSearchParams])

  const activeCount = useMemo(
    () =>
      Object.entries(filters).filter(
        ([key, value]) => value && value !== defaultsRef.current[key as keyof T],
      ).length,
    [filters],
  )

  return { filters, setFilter, setFilters, resetFilters, activeCount }
}
