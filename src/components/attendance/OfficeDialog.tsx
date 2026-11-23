'use client'

import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { OfficeMapPicker } from './OfficeMapPicker'
import { saveOfficeAction } from '@/app/(app)/admin/attendance/actions'

interface OfficeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  office?: any
  onSaved: () => void
}

export function OfficeDialog({ open, onOpenChange, office, onSaved }: OfficeDialogProps) {
  const [name, setName] = useState(office?.name || '')
  const [address, setAddress] = useState(office?.address || '')
  const [lat, setLat] = useState<number>(office?.latitude || 25.276987)
  const [lng, setLng] = useState<number>(office?.longitude || 55.334587)
  const [radiusM, setRadiusM] = useState<number>(office?.radius_m || 100)
  const [ipsText, setIpsText] = useState((office?.allowed_public_ips || []).join(', '))
  const [requireNet, setRequireNet] = useState(office?.require_network_match ?? true)
  const [isActive, setIsActive] = useState(office?.is_active ?? true)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const ips = ipsText
      .split(',')
      .map((ip: string) => ip.trim())
      .filter(Boolean)

    const res = await saveOfficeAction({
      id: office?.id,
      name,
      address,
      latitude: lat,
      longitude: lng,
      radius_m: radiusM,
      allowed_public_ips: ips,
      require_network_match: requireNet,
      is_active: isActive,
    })

    setSaving(false)

    if (res.success) {
      onOpenChange(false)
      onSaved()
    } else {
      setError(res.error || 'Failed to save office')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="wide">
        <DialogHeader>
          <DialogTitle>{office ? 'Edit Office Geofence' : 'Add New Office'}</DialogTitle>
          <DialogDescription>
            Configure office coordinates, geofence radius, and network matching rules.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {error && (
              <div className="p-3 text-xs text-red-600 bg-red-50 rounded-lg border border-red-200">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="off-name">Office Name</Label>
              <Input
                id="off-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. EduBridge Main Office"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="off-radius">Geofence Radius (meters: 30 – 1000)</Label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="30"
                  max="1000"
                  step="10"
                  value={radiusM}
                  onChange={(e) => setRadiusM(parseInt(e.target.value, 10))}
                  className="flex-1 accent-[#00A57E]"
                />
                <span className="text-sm font-semibold w-16 text-right tabular-nums">{radiusM} m</span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="off-addr">Physical Address</Label>
            <Input
              id="off-addr"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. M03, Royal House Building, Hor Al Anz East, Dubai"
              required
            />
          </div>

          {/* Interactive Map Picker */}
          <div className="space-y-1.5">
            <Label>Geofence Location Map</Label>
            <OfficeMapPicker
              latitude={lat}
              longitude={lng}
              radiusMeters={radiusM}
              onChange={(coords) => {
                setLat(coords.lat)
                setLng(coords.lng)
                setRadiusM(coords.radiusM)
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="off-ips">Allowed Public IPs (comma-separated)</Label>
            <Input
              id="off-ips"
              value={ipsText}
              onChange={(e) => setIpsText(e.target.value)}
              placeholder="e.g. 195.229.241.1, 213.42.1.20"
            />
            <p className="text-[11px] text-muted-foreground">
              Optional. If specified, punches must originate from one of these office internet IPs.
            </p>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-[#E4E7E7] bg-white">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Require Network Match</Label>
              <p className="text-xs text-muted-foreground">
                Staff must be connected to office Wi-Fi / IP to punch in
              </p>
            </div>
            <Switch checked={requireNet} onCheckedChange={setRequireNet} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-[#E4E7E7] bg-white">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Active Office</Label>
              <p className="text-xs text-muted-foreground">
                Only active offices are available for staff punch geofencing
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-xl border-[#E4E7E7] text-xs h-9 px-4"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[#00A57E] hover:bg-[#00805F] text-white text-xs h-9 px-4"
            >
              {saving ? 'Saving...' : 'Save Office'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
