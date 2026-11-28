'use client'

import React, { useState, useEffect, useTransition } from 'react'
import {
  Clock,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ShieldAlert,
  Info,
  Send,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { punchAction, getTodayAttendanceStatusAction } from '@/app/(app)/attendance/actions'
import { formatWorkedHours } from '@/lib/attendance/utils'

export interface TodayAttendanceData {
  todayStr: string
  isPunchedIn: boolean
  lastPunch?: { at: string; kind: string; id: string } | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  todayPunches?: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dayRecord?: { worked_minutes: number; status: string; late_minutes?: number } | any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings?: { attendance_required?: boolean; allow_field_punch?: boolean } | any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  office?: { name: string; radius_m: number } | any
}

interface HomePunchCardProps {
  initialData?: TodayAttendanceData
  compact?: boolean // For account sheet
}

export function HomePunchCard({ initialData, compact = false }: HomePunchCardProps) {
  const [data, setData] = useState<TodayAttendanceData | undefined>(initialData)
  const [loading, setLoading] = useState(!initialData)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [punching, setPunching] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false)
  const [fieldPunchModalOpen, setFieldPunchModalOpen] = useState(false)
  const [fieldNote, setFieldNote] = useState('')
  const [, startTransition] = useTransition()

  // Live timer for active session
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const fetchStatus = () => {
    setLoading(true)
    setLoadError(null)
    getTodayAttendanceStatusAction()
      .then((res) => {
        setLoading(false)
        if (res.success && res.data) {
          setData(res.data)
        } else if (!res.success) {
          setLoadError(res.error || 'Failed to load attendance status')
        }
      })
      .catch((err) => {
        setLoading(false)
        setLoadError(err instanceof Error ? err.message : 'Failed to load attendance status')
      })
  }

  // Fetch status on load if not provided
  useEffect(() => {
    let ignore = false
    if (!initialData) {
      void Promise.resolve().then(() => {
        if (!ignore) {
          fetchStatus()
        }
      })
    }
    return () => {
      ignore = true
    }
  }, [initialData])

  // Live counter
  useEffect(() => {
    if (!data?.isPunchedIn || !data?.lastPunch?.at) {
      return
    }

    const startMs = new Date(data.lastPunch.at).getTime()
    const updateTimer = () => {
      const nowMs = Date.now()
      const diffSecs = Math.max(0, Math.floor((nowMs - startMs) / 1000))
      setElapsedSeconds(diffSecs)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [data?.isPunchedIn, data?.lastPunch?.at])

  // Generate or read persistent device hash
  const getDeviceHash = (): string => {
    if (typeof window === 'undefined') return 'unknown-device'
    let hash = localStorage.getItem('edubridge_device_hash')
    if (!hash) {
      hash = 'dev_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36)
      localStorage.setItem('edubridge_device_hash', hash)
    }
    return hash
  }

  // Handle Punch click
  const handlePunchClick = (kind: 'in' | 'out') => {
    setErrorMsg(null)

    // Check one-time privacy notice
    const privacyAccepted = localStorage.getItem('edubridge_location_privacy_accepted')
    if (!privacyAccepted) {
      setPrivacyModalOpen(true)
      return
    }

    executeGPSPunch(kind)
  }

  const executeGPSPunch = (kind: 'in' | 'out', note?: string) => {
    const insecureOrUnavailableMsg =
      'Location needs a secure (https) connection or permission. Use the app link, or allow location.'

    if (typeof window !== 'undefined' && (!window.isSecureContext || !navigator.geolocation)) {
      setPunching(false)
      setErrorMsg(insecureOrUnavailableMsg)
      return
    }

    setPunching(true)
    setErrorMsg(null)

    let settled = false
    const timeoutGuard = setTimeout(() => {
      if (settled) return
      settled = true
      setPunching(false)
      setErrorMsg(insecureOrUnavailableMsg)
    }, 10500)

    try {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (settled) return
          settled = true
          clearTimeout(timeoutGuard)

          const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }

          const res = await punchAction({
            kind,
            lat: coords.lat,
            lng: coords.lng,
            accuracy: coords.accuracy,
            note,
            deviceHash: getDeviceHash(),
            clientTime: new Date().toISOString(),
          })

          setPunching(false)

          if (!res.success) {
            // If staff allows field punch and outside geofence, prompt for note
            if (data?.settings?.allow_field_punch && !note) {
              setFieldPunchModalOpen(true)
              return
            }

            setErrorMsg(res.error || 'Failed to record punch.')
          } else {
            // Refresh status
            const refreshed = await getTodayAttendanceStatusAction()
            if (refreshed.success && refreshed.data) {
              startTransition(() => {
                setData(refreshed.data)
              })
            }
          }
        },
        (geoErr) => {
          if (settled) return
          settled = true
          clearTimeout(timeoutGuard)
          setPunching(false)
          if (geoErr.code === geoErr.PERMISSION_DENIED || geoErr.code === geoErr.TIMEOUT) {
            setErrorMsg(insecureOrUnavailableMsg)
          } else {
            setErrorMsg(insecureOrUnavailableMsg)
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    } catch {
      if (!settled) {
        settled = true
        clearTimeout(timeoutGuard)
        setPunching(false)
        setErrorMsg(insecureOrUnavailableMsg)
      }
    }
  }

  const handleConfirmPrivacy = () => {
    localStorage.setItem('edubridge_location_privacy_accepted', 'true')
    setPrivacyModalOpen(false)
    executeGPSPunch(data?.isPunchedIn ? 'out' : 'in')
  }

  const handleConfirmFieldPunch = () => {
    if (!fieldNote || fieldNote.trim().length < 5) {
      setErrorMsg('Field punch requires a detailed note (min 5 characters).')
      return
    }
    setFieldPunchModalOpen(false)
    executeGPSPunch(data?.isPunchedIn ? 'out' : 'in', fieldNote.trim())
    setFieldNote('')
  }

  // Format live timer
  const formatLiveTimer = (secs: number) => {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#E4E7E7] p-5 animate-pulse flex items-center justify-center min-h-[140px]">
        <Loader2 className="w-6 h-6 text-[#00A57E] animate-spin" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-5 flex flex-col items-center justify-center min-h-[140px] text-center space-y-2">
        <p className="text-xs text-red-600">Couldn&apos;t load attendance status</p>
        <button
          type="button"
          onClick={fetchStatus}
          className="text-xs font-semibold text-[#00805F] hover:underline"
        >
          Retry
        </button>
      </div>
    )
  }

  // If attendance not required for this user, render nothing or minimal banner
  if (data?.settings && data.settings.attendance_required === false) {
    return null
  }

  const isPunchedIn = Boolean(data?.isPunchedIn)
  const workedMinutes = data?.dayRecord?.worked_minutes || 0
  const officeName = data?.office?.name || 'EduBridge Main Office'
  const officeRadius = data?.office?.radius_m || 100
  const lastPunchTime = data?.lastPunch?.at
    ? new Date(data.lastPunch.at).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
    : null

  const dayStatus = data?.dayRecord?.status || (isPunchedIn ? 'present' : 'pending')

  return (
    <>
      <div
        className={`bg-white rounded-2xl border border-[#E4E7E7] shadow-xs overflow-hidden transition-all ${compact ? 'p-4' : 'p-5 sm:p-6'
          }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#F5F6F6]">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isPunchedIn ? 'bg-[#E6F6F2] text-[#00A57E]' : 'bg-[#F5F6F6] text-[#6B7272]'
                }`}
            >
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#0A0A0A]">Today&apos;s Attendance</h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${isPunchedIn
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : dayStatus === 'late'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : dayStatus === 'absent'
                        ? 'bg-red-50 text-red-800 border-red-200'
                        : dayStatus === 'on_leave'
                          ? 'bg-blue-50 text-blue-800 border-blue-200'
                          : 'bg-[#F5F6F6] text-[#6B7272] border-[#E4E7E7]'
                    }`}
                >
                  {isPunchedIn ? 'Punched In' : dayStatus.replace('_', ' ')}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-[#6B7272]">
                <MapPin className="w-3.5 h-3.5 text-[#00A57E]" />
                <span className="truncate">
                  {officeName} ({officeRadius}m geofence)
                </span>
              </div>
            </div>
          </div>

          <div className="text-left sm:text-right w-full sm:w-auto">
            <span className="text-[11px] text-[#6B7272] block">Today&apos;s Worked Time</span>
            <span className="text-lg font-bold text-[#0A0A0A] font-mono tabular-nums">
              {formatWorkedHours(workedMinutes)}
            </span>
          </div>
        </div>

        {/* Live Session Counter */}
        {isPunchedIn && (
          <div className="my-3 py-2 px-3 rounded-xl bg-[#E6F6F2]/60 border border-[#CCEDE5] flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-[#00805F]">
              <span className="w-2 h-2 rounded-full bg-[#00A57E] animate-ping" />
              <span>Session Active:</span>
            </div>
            <span className="text-sm font-bold font-mono text-[#00805F] tabular-nums">
              {formatLiveTimer(elapsedSeconds)}
            </span>
          </div>
        )}

        {/* Error Notification */}
        {errorMsg && (
          <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">{errorMsg}</p>
              <button
                type="button"
                onClick={() => executeGPSPunch(isPunchedIn ? 'out' : 'in')}
                className="mt-1.5 text-xs font-bold text-red-800 underline inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Retry Punch
              </button>
            </div>
          </div>
        )}

        {/* Main Action Button */}
        <div className="mt-4 flex flex-col sm:flex-row items-center gap-3">
          <Button
            type="button"
            disabled={punching}
            onClick={() => handlePunchClick(isPunchedIn ? 'out' : 'in')}
            className={`w-full h-12 text-sm font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 ${isPunchedIn
              ? 'bg-amber-600 hover:bg-amber-700 text-white'
              : 'bg-[#00A57E] hover:bg-[#00805F] text-white'
              }`}
          >
            {punching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying GPS Geofence...</span>
              </>
            ) : isPunchedIn ? (
              <>
                <Clock className="w-4 h-4" />
                <span>Punch Out</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Punch In</span>
              </>
            )}
          </Button>
        </div>

        {lastPunchTime && (
          <p className="text-center text-[11px] text-[#6B7272] mt-2">
            Last {isPunchedIn ? 'punch in' : 'punch out'} at {lastPunchTime}
          </p>
        )}
      </div>

      {/* 1. Location Privacy Notice Modal */}
      <Dialog open={privacyModalOpen} onOpenChange={setPrivacyModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="w-10 h-10 rounded-full bg-[#E6F6F2] text-[#00A57E] flex items-center justify-center mb-2">
              <Info className="w-5 h-5" />
            </div>
            <DialogTitle className="text-base font-bold text-[#0A0A0A]">
              Location Verification Notice
            </DialogTitle>
            <DialogDescription className="text-xs text-[#6B7272] leading-relaxed pt-1">
              Your location is captured <strong>only at the exact moment</strong> you tap Punch in or Punch out to verify that you are within the assigned office geofence.
              <br /><br />
              EduBridge Portal <strong>never</strong> tracks your background location or monitors your device outside punch timestamps.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPrivacyModalOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmPrivacy}
              className="text-xs bg-[#00A57E] hover:bg-[#00805F] text-white"
            >
              I Understand &amp; Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Field Punch Note Modal */}
      <Dialog open={fieldPunchModalOpen} onOpenChange={setFieldPunchModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-2">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <DialogTitle className="text-base font-bold text-[#0A0A0A]">
              Field Punch (Outside Geofence)
            </DialogTitle>
            <DialogDescription className="text-xs text-[#6B7272] leading-relaxed pt-1">
              You are currently outside the assigned office geofence. Since field punches are enabled for your role, you may submit this punch for administrative review by providing a mandatory note explaining your client meeting or field location.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="field-note" className="text-xs font-semibold text-[#0A0A0A]">
              Meeting / Client Location Note (min 5 characters)
            </Label>
            <Textarea
              id="field-note"
              value={fieldNote}
              onChange={(e) => setFieldNote(e.target.value)}
              placeholder="e.g. Client consultation at Dubai Internet City, building 3"
              rows={3}
              className="text-xs rounded-xl"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setFieldPunchModalOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmFieldPunch}
              className="text-xs bg-[#00A57E] hover:bg-[#00805F] text-white gap-1.5"
            >
              <Send className="w-3.5 h-3.5" /> Submit for Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
