import { describe, it, expect } from 'vitest'
import {
  calculateHaversineDistance,
  isInsideGeofence,
  calculateLateMinutes,
  determineDayStatus,
  formatWorkedHours,
  getDubaiDateString,
} from './utils'

describe('Attendance Domain Utils', () => {
  describe('calculateHaversineDistance', () => {
    it('returns 0 for identical points', () => {
      const dist = calculateHaversineDistance(25.276987, 55.334587, 25.276987, 55.334587)
      expect(dist).toBe(0)
    })

    it('calculates accurate distance within Dubai (e.g. Royal House to Airport ~3.5km)', () => {
      // Royal House (Hor Al Anz) to Dubai Airport DXB T1
      const dist = calculateHaversineDistance(25.276987, 55.334587, 25.253164, 55.365673)
      expect(dist).toBeGreaterThan(3000)
      expect(dist).toBeLessThan(5000)
    })

    it('handles large distances correctly without precision overflow', () => {
      // Dubai to London (~5,470 km)
      const dist = calculateHaversineDistance(25.2048, 55.2708, 51.5074, -0.1278)
      expect(dist).toBeGreaterThan(5400000)
      expect(dist).toBeLessThan(5600000)
    })

    it('returns Infinity for invalid coordinates', () => {
      // @ts-expect-error test null inputs
      expect(calculateHaversineDistance(null, 55.33, 25.27, 55.33)).toBe(Infinity)
    })
  })

  describe('isInsideGeofence', () => {
    it('accepts points strictly inside base radius', () => {
      const result = isInsideGeofence(80, 100, 0)
      expect(result.inside).toBe(true)
      expect(result.allowedRadius).toBe(100)
    })

    it('accepts points at exact boundary', () => {
      const result = isInsideGeofence(100, 100, 0)
      expect(result.inside).toBe(true)
    })

    it('rejects points beyond base radius when accuracy is zero', () => {
      const result = isInsideGeofence(101, 100, 0)
      expect(result.inside).toBe(false)
    })

    it('applies accuracy padding up to 50m cap', () => {
      // 100m radius + min(30m accuracy, 50m) = 130m allowed
      const result30 = isInsideGeofence(125, 100, 30)
      expect(result30.inside).toBe(true)
      expect(result30.allowedRadius).toBe(130)

      // 100m radius + min(120m accuracy, 50m) = 150m allowed
      const result120 = isInsideGeofence(145, 100, 120)
      expect(result120.inside).toBe(true)
      expect(result120.padding).toBe(50)

      const resultTooFar = isInsideGeofence(155, 100, 120)
      expect(resultTooFar.inside).toBe(false)
    })
  })

  describe('calculateLateMinutes', () => {
    it('returns 0 if arrival is before or on shift start', () => {
      // 08:55 arrival for 09:00 shift
      const arrival = new Date('2026-11-23T04:55:00.000Z') // 08:55 in Asia/Dubai (UTC+4)
      const late = calculateLateMinutes(arrival, '09:00:00', 15, 'Asia/Dubai')
      expect(late).toBe(0)
    })

    it('returns 0 if arrival is within grace period (09:10 arrival for 09:00 shift with 15m grace)', () => {
      const arrival = new Date('2026-11-23T05:10:00.000Z') // 09:10 in Asia/Dubai
      const late = calculateLateMinutes(arrival, '09:00:00', 15, 'Asia/Dubai')
      expect(late).toBe(0)
    })

    it('returns exact late minutes beyond shift start if arrival exceeds grace period', () => {
      // 09:25 arrival for 09:00 shift (25 mins late)
      const arrival = new Date('2026-11-23T05:25:00.000Z') // 09:25 in Asia/Dubai
      const late = calculateLateMinutes(arrival, '09:00:00', 15, 'Asia/Dubai')
      expect(late).toBe(25)
    })
  })

  describe('determineDayStatus', () => {
    it('marks holiday and leave with priority', () => {
      expect(determineDayStatus({ workedMinutes: 500, lateMinutes: 0, isHoliday: true })).toBe('holiday')
      expect(determineDayStatus({ workedMinutes: 500, lateMinutes: 0, isLeave: true })).toBe('on_leave')
    })

    it('marks pending if open session is active', () => {
      expect(determineDayStatus({ workedMinutes: 120, lateMinutes: 0, hasOpenSession: true })).toBe('pending')
    })

    it('marks weekly_off when 0 worked minutes on off day', () => {
      expect(determineDayStatus({ workedMinutes: 0, lateMinutes: 0, isWeeklyOff: true })).toBe('weekly_off')
    })

    it('marks absent when 0 worked minutes on working day', () => {
      expect(determineDayStatus({ workedMinutes: 0, lateMinutes: 0, isWeeklyOff: false })).toBe('absent')
    })

    it('marks present for full day (>= 8h) on time', () => {
      expect(determineDayStatus({ workedMinutes: 480, lateMinutes: 0 })).toBe('present')
    })

    it('marks late for full day (>= 8h) with late arrival', () => {
      expect(determineDayStatus({ workedMinutes: 480, lateMinutes: 20 })).toBe('late')
    })

    it('marks half_day for worked time between 4h and 8h', () => {
      expect(determineDayStatus({ workedMinutes: 300, lateMinutes: 0 })).toBe('half_day')
    })
  })

  describe('formatWorkedHours', () => {
    it('formats hours and minutes with leading zero', () => {
      expect(formatWorkedHours(0)).toBe('0h 00m')
      expect(formatWorkedHours(45)).toBe('0h 45m')
      expect(formatWorkedHours(485)).toBe('8h 05m')
      expect(formatWorkedHours(540)).toBe('9h 00m')
    })
  })

  describe('getDubaiDateString', () => {
    it('correctly maps UTC late evening to Asia/Dubai next morning', () => {
      // 2026-11-22 21:00:00 UTC = 2026-11-23 01:00:00 Asia/Dubai (UTC+4)
      const date = new Date('2026-11-22T21:00:00.000Z')
      expect(getDubaiDateString(date)).toBe('2026-11-23')
    })
  })
})
