import { useEffect, useRef, useState } from 'react'

export function useInfiniteScroll(itemCount: number, initialVisible = 20, increment = 10) {
  const [visibleCount, setVisibleCount] = useState(initialVisible)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisibleCount(n => n + increment) },
      { threshold: 0.1 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [itemCount, increment])

  return { visibleCount, setVisibleCount, sentinelRef }
}
