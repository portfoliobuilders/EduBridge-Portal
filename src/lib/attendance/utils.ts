/**
 * Core attendance domain calculations:
 * - Haversine distance
 * - Geofencing validation with GPS accuracy padding
 * - Late minutes, shift boundaries and status resolution in Asia/Dubai
 */

export interface PunchPair {
  in: string | Date
  out?: string | Date | null
}

/**
 * Calculates great-circle distance between two GPS coordinates in meters.
 */
export function calculateHaversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) {
    return Infinity
  }

  const R = 6371000 // Earth's mean radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 100) / 100
}

/**
 * Validates whether GPS coordinates fall within the geofence radius,
 * applying an accuracy padding of min(accuracy, 50m).
 */
export function isInsideGeofence(
  distanceMeters: number,
  radiusMeters: number,
  accuracyMeters: number = 0
): { inside: boolean; allowedRadius: number; padding: number } {
  const padding = Math.min(Math.max(accuracyMeters || 0, 0), 50.0)
  const allowedRadius = radiusMeters + padding
  return {
    inside: distanceMeters <= allowedRadius,
    allowedRadius,
    padding,
  }
}

/**
 * Parses time string (e.g., '09:00:00' or '09:00') into hours & minutes.
 */
export function parseTimeString(timeStr: string): { hours: number; minutes: number } {
  const [hStr, mStr] = timeStr.split(':')
  return {
    hours: parseInt(hStr || '0', 10),
    minutes: parseInt(mStr || '0', 10),
  }
}

/**
 * Calculates late arrival in minutes beyond the shift start + grace window.
 */
export function calculateLateMinutes(
  punchInTime: Date,
  shiftStartTime: string,
  graceMinutes: number = 15,
  timeZone: string = 'Asia/Dubai'
): number {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  })

  const parts = formatter.formatToParts(punchInTime)
  const punchHour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10)
  const punchMinute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10)

  const punchMinutesOfDay = punchHour * 60 + punchMinute
  const { hours: shiftHour, minutes: shiftMinute } = parseTimeString(shiftStartTime)
  const shiftMinutesOfDay = shiftHour * 60 + shiftMinute

  const allowedMinutes = shiftMinutesOfDay + graceMinutes

  if (punchMinutesOfDay > allowedMinutes) {
    return punchMinutesOfDay - shiftMinutesOfDay
  }
  return 0
}

/**
 * Evaluates attendance day status based on worked hours and rules.
 */
export function determineDayStatus({
  workedMinutes,
  lateMinutes,
  isHoliday = false,
  isLeave = false,
  isWeeklyOff = false,
  hasOpenSession = false,
  minFullHours = 8.0,
  minHalfHours = 4.0,
}: {
  workedMinutes: number
  lateMinutes: number
  isHoliday?: boolean
  isLeave?: boolean
  isWeeklyOff?: boolean
  hasOpenSession?: boolean
  minFullHours?: number
  minHalfHours?: number
}): 'present' | 'late' | 'half_day' | 'absent' | 'on_leave' | 'holiday' | 'weekly_off' | 'missing_checkout' | 'pending' {
  if (isHoliday) return 'holiday'
  if (isLeave) return 'on_leave'
  if (hasOpenSession) return 'pending'

  if (workedMinutes <= 0 && isWeeklyOff) return 'weekly_off'
  if (workedMinutes <= 0) return 'absent'

  const fullMinutes = minFullHours * 60
  const halfMinutes = minHalfHours * 60

  if (workedMinutes >= fullMinutes) {
    return lateMinutes > 0 ? 'late' : 'present'
  }

  if (workedMinutes >= halfMinutes) {
    return 'half_day'
  }

  return lateMinutes > 0 ? 'late' : 'half_day'
}

/**
 * Formats minutes into human-readable duration (e.g. '7h 45m' or '45m').
 */
export function formatWorkedHours(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0h 00m'
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}h ${m < 10 ? '0' : ''}${m}m`
}

/**
 * Returns YYYY-MM-DD date string in target time zone (default Asia/Dubai).
 */
export function getDubaiDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(date) // Returns YYYY-MM-DD
}
