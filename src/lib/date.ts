import { toZonedTime, format } from 'date-fns-tz'

export const TIMEZONE_DUBAI = 'Asia/Dubai'

export function formatDubaiDate(
  date: string | Date | null | undefined,
  fmt = 'dd MMM yyyy'
): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  return format(toZonedTime(d, TIMEZONE_DUBAI), fmt)
}

export function formatDubaiDateTime(
  date: string | Date | null | undefined,
  fmt = 'dd MMM yyyy, hh:mm a'
): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  return format(toZonedTime(d, TIMEZONE_DUBAI), fmt)
}

/**
 * Returns ISO strings with Asia/Dubai offset (+04:00) for common period ranges
 */
export function getDubaiDateRange(
  period: 'today' | 'week' | 'month' | 'custom',
  customFrom?: string,
  customTo?: string
): { from: string; to: string; label: string } {
  const nowInDubai = toZonedTime(new Date(), TIMEZONE_DUBAI)
  const yyyy = nowInDubai.getFullYear()
  const mm = String(nowInDubai.getMonth() + 1).padStart(2, '0')
  const dd = String(nowInDubai.getDate()).padStart(2, '0')
  const todayStr = `${yyyy}-${mm}-${dd}`

  if (period === 'today') {
    return {
      from: `${todayStr}T00:00:00+04:00`,
      to: `${todayStr}T23:59:59.999+04:00`,
      label: 'Today',
    }
  }

  if (period === 'week') {
    // Current day of week (0=Sun, 1=Mon, ..., 6=Sat). In UAE / standard business, week is Mon-Sun
    const day = nowInDubai.getDay()
    const diffToMonday = (day + 6) % 7
    const monday = new Date(nowInDubai.getTime() - diffToMonday * 86400000)
    const monY = monday.getFullYear()
    const monM = String(monday.getMonth() + 1).padStart(2, '0')
    const monD = String(monday.getDate()).padStart(2, '0')
    const monStr = `${monY}-${monM}-${monD}`

    return {
      from: `${monStr}T00:00:00+04:00`,
      to: `${todayStr}T23:59:59.999+04:00`,
      label: 'This Week',
    }
  }

  if (period === 'month') {
    return {
      from: `${yyyy}-${mm}-01T00:00:00+04:00`,
      to: `${todayStr}T23:59:59.999+04:00`,
      label: 'This Month',
    }
  }

  // Custom
  const f = customFrom || todayStr
  const t = customTo || todayStr
  return {
    from: `${f}T00:00:00+04:00`,
    to: `${t}T23:59:59.999+04:00`,
    label: `${f} to ${t}`,
  }
}

/**
 * Formats a timestamp into friendly relative time: "Today", "Yesterday", "3 days ago", or "X weeks/months ago"
 */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'

  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  if (diffMs < 0) return 'Just now'

  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHours = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 30) return `${diffDays} days ago`
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return months === 1 ? '1 month ago' : `${months} months ago`
  }
  const years = Math.floor(diffDays / 365)
  return years === 1 ? '1 year ago' : `${years} years ago`
}
