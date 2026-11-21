'use client'

import React, { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/PhoneInput'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Users,
  Edit2,
  Plus,
  Phone,
  Mail,
  MessageSquare,
  Loader2,
  Building2,
  Truck,
} from 'lucide-react'
import { COUNTRIES, GUARDIAN_RELATIONS } from '@/lib/constants'
import {
  updateStudentGuardianAction,
  saveStudentAddressAction,
} from '../actions'

export interface StudentAddress {
  id: string
  student_id: string
  type: 'billing' | 'shipping'
  contact_name: string | null
  contact_phone: string | null
  line1: string
  line2: string | null
  city: string
  state: string | null
  postal_code: string | null
  country: string
  is_default: boolean
}

export interface GuardianInfo {
  guardian_name: string | null
  guardian_relation: string | null
  guardian_phone: string | null
  guardian_whatsapp: string | null
  guardian_email: string | null
}

interface ContactsAndAddressesCardProps {
  studentId: string
  canEdit: boolean
  guardian: GuardianInfo
  addresses: StudentAddress[]
}

export function ContactsAndAddressesCard({
  studentId,
  canEdit,
  guardian,
  addresses,
}: ContactsAndAddressesCardProps) {
  // Modal states
  const [guardianModalOpen, setGuardianModalOpen] = useState(false)
  const [addressModalOpen, setAddressModalOpen] = useState(false)
  const [activeAddressType, setActiveAddressType] = useState<'billing' | 'shipping'>('billing')

  // Form states for guardian
  const [gName, setGName] = useState(guardian.guardian_name || '')
  const [gRelation, setGRelation] = useState(guardian.guardian_relation || 'father')
  const [gPhone, setGPhone] = useState(guardian.guardian_phone || '')
  const [gWhatsapp, setGWhatsapp] = useState(guardian.guardian_whatsapp || '')
  const [sameGWhatsapp, setSameGWhatsapp] = useState(!guardian.guardian_whatsapp || guardian.guardian_whatsapp === guardian.guardian_phone)
  const [gEmail, setGEmail] = useState(guardian.guardian_email || '')
  const [isPendingG, startTransitionG] = useTransition()
  const [guardianError, setGuardianError] = useState<string | null>(null)

  // Current addresses
  const billingAddress = addresses.find((a) => a.type === 'billing' && a.is_default) || addresses.find((a) => a.type === 'billing')
  const shippingAddress = addresses.find((a) => a.type === 'shipping' && a.is_default) || addresses.find((a) => a.type === 'shipping')

  // Form states for address
  const [targetAddressId, setTargetAddressId] = useState<string | undefined>()
  const [aContactName, setAContactName] = useState('')
  const [aContactPhone, setAContactPhone] = useState('')
  const [aLine1, setALine1] = useState('')
  const [aLine2, setALine2] = useState('')
  const [aCity, setACity] = useState('Dubai')
  const [aState, setAState] = useState('')
  const [aPostalCode, setAPostalCode] = useState('')
  const [aCountry, setACountry] = useState('United Arab Emirates')
  const [isPendingA, startTransitionA] = useTransition()
  const [addressError, setAddressError] = useState<string | null>(null)

  // Open Guardian Modal
  const openGuardianModal = () => {
    setGName(guardian.guardian_name || '')
    setGRelation(guardian.guardian_relation || 'father')
    setGPhone(guardian.guardian_phone || '')
    setGWhatsapp(guardian.guardian_whatsapp || '')
    setSameGWhatsapp(!guardian.guardian_whatsapp || guardian.guardian_whatsapp === guardian.guardian_phone)
    setGEmail(guardian.guardian_email || '')
    setGuardianError(null)
    setGuardianModalOpen(true)
  }

  // Open Address Modal
  const openAddressModal = (type: 'billing' | 'shipping') => {
    setActiveAddressType(type)
    const current = type === 'billing' ? billingAddress : shippingAddress
    if (current) {
      setTargetAddressId(current.id)
      setAContactName(current.contact_name || '')
      setAContactPhone(current.contact_phone || '')
      setALine1(current.line1)
      setALine2(current.line2 || '')
      setACity(current.city)
      setAState(current.state || '')
      setAPostalCode(current.postal_code || '')
      setACountry(current.country || 'United Arab Emirates')
    } else {
      setTargetAddressId(undefined)
      setAContactName('')
      setAContactPhone('')
      setALine1('')
      setALine2('')
      setACity('Dubai')
      setAState('')
      setAPostalCode('')
      setACountry('United Arab Emirates')
    }
    setAddressError(null)
    setAddressModalOpen(true)
  }

  // Save Guardian
  const handleSaveGuardian = (e: React.FormEvent) => {
    e.preventDefault()
    setGuardianError(null)

    startTransitionG(async () => {
      const res = await updateStudentGuardianAction({
        studentId,
        guardianName: gName.trim() || null,
        guardianRelation: gName.trim() ? (gRelation as 'father' | 'mother' | 'guardian' | 'spouse' | 'other') : null,
        guardianPhone: gPhone.trim() || null,
        guardianWhatsapp: sameGWhatsapp ? (gPhone.trim() || null) : (gWhatsapp.trim() || null),
        guardianEmail: gEmail.trim() || null,
      })

      if (!res.success) {
        setGuardianError(res.error || 'Failed to update guardian details')
        return
      }

      setGuardianModalOpen(false)
    })
  }

  // Save Address
  const handleSaveAddress = (e: React.FormEvent) => {
    e.preventDefault()
    if (!aLine1.trim()) {
      setAddressError('Address line 1 is required')
      return
    }
    if (!aCity.trim()) {
      setAddressError('City is required')
      return
    }

    setAddressError(null)

    startTransitionA(async () => {
      const res = await saveStudentAddressAction({
        studentId,
        type: activeAddressType,
        addressId: targetAddressId,
        contactName: aContactName.trim() || null,
        contactPhone: aContactPhone.trim() || null,
        line1: aLine1.trim(),
        line2: aLine2.trim() || null,
        city: aCity.trim(),
        state: aState.trim() || null,
        postalCode: aPostalCode.trim() || null,
        country: aCountry.trim() || 'United Arab Emirates',
      })

      if (!res.success) {
        setAddressError(res.error || 'Failed to save address')
        return
      }

      setAddressModalOpen(false)
    })
  }

  const guardianRelationLabel = GUARDIAN_RELATIONS.find(
    (r) => r.value === guardian.guardian_relation
  )?.label || guardian.guardian_relation

  return (
    <div id="card-contacts-addresses" className="rounded-2xl bg-white p-5 sm:p-6 shadow-sm border border-[#E4E7E7] space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-[#E4E7E7]">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-[#00A57E]" />
          <h2 className="text-base font-semibold text-[#0A0A0A]">
            Contacts & Addresses
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Guardian Details Box */}
        <div className="rounded-xl border border-[#E4E7E7] bg-[#FAFAFA] p-4 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#00A57E] flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                <span>Parent / Guardian</span>
              </span>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={openGuardianModal}
                  className="h-7 text-xs text-[#00805F] hover:text-[#005c44] hover:bg-[#E6F6F2] px-2 gap-1"
                >
                  {guardian.guardian_name ? (
                    <>
                      <Edit2 className="h-3 w-3" />
                      <span>Edit</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-3 w-3" />
                      <span>Add</span>
                    </>
                  )}
                </Button>
              )}
            </div>

            {guardian.guardian_name ? (
              <div className="space-y-1.5 text-xs">
                <div className="font-semibold text-sm text-[#0A0A0A] flex items-center gap-1.5">
                  <span>{guardian.guardian_name}</span>
                  {guardianRelationLabel && (
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
                      {guardianRelationLabel}
                    </span>
                  )}
                </div>

                {guardian.guardian_phone && (
                  <div className="flex items-center gap-1.5 text-[#6B7272] pt-0.5">
                    <Phone className="h-3 w-3 text-[#00A57E]" />
                    <a
                      href={`tel:${guardian.guardian_phone}`}
                      className="font-mono hover:text-[#0A0A0A]"
                    >
                      {guardian.guardian_phone}
                    </a>
                  </div>
                )}

                {guardian.guardian_whatsapp && (
                  <div className="flex items-center gap-1.5 text-[#6B7272]">
                    <MessageSquare className="h-3 w-3 text-[#00A57E]" />
                    <a
                      href={`https://wa.me/${guardian.guardian_whatsapp.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[#0A0A0A]"
                    >
                      WhatsApp
                    </a>
                  </div>
                )}

                {guardian.guardian_email && (
                  <div className="flex items-center gap-1.5 text-[#6B7272]">
                    <Mail className="h-3 w-3 text-[#00A57E]" />
                    <span className="truncate">{guardian.guardian_email}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-[#6B7272] italic py-2">
                No parent/guardian recorded.
              </p>
            )}
          </div>
        </div>

        {/* 2. Billing Address Box */}
        <div className="rounded-xl border border-[#E4E7E7] bg-[#FAFAFA] p-4 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#00A57E] flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                <span>Billing Address</span>
              </span>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openAddressModal('billing')}
                  className="h-7 text-xs text-[#00805F] hover:text-[#005c44] hover:bg-[#E6F6F2] px-2 gap-1"
                >
                  {billingAddress ? (
                    <>
                      <Edit2 className="h-3 w-3" />
                      <span>Edit</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-3 w-3" />
                      <span>Add</span>
                    </>
                  )}
                </Button>
              )}
            </div>

            {billingAddress ? (
              <div className="space-y-1 text-xs">
                {billingAddress.contact_name && (
                  <div className="font-semibold text-[#0A0A0A]">
                    Attn: {billingAddress.contact_name}
                  </div>
                )}
                {billingAddress.contact_phone && (
                  <div className="text-[#6B7272] font-mono">
                    Tel: {billingAddress.contact_phone}
                  </div>
                )}
                <div className="text-[#0A0A0A] pt-0.5">
                  {billingAddress.line1}
                  {billingAddress.line2 ? `, ${billingAddress.line2}` : ''}
                </div>
                <div className="text-[#6B7272]">
                  {billingAddress.city}
                  {billingAddress.state ? `, ${billingAddress.state}` : ''}
                  {billingAddress.postal_code ? ` ${billingAddress.postal_code}` : ''}
                </div>
                <div className="text-xs font-medium text-[#0A0A0A]">
                  {billingAddress.country}
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#6B7272] italic py-2">
                No billing address recorded. Defaulting receipts to candidate details.
              </p>
            )}
          </div>
        </div>

        {/* 3. Shipping Address Box */}
        <div className="rounded-xl border border-[#E4E7E7] bg-[#FAFAFA] p-4 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#00A57E] flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5" />
                <span>Shipping Address</span>
              </span>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openAddressModal('shipping')}
                  className="h-7 text-xs text-[#00805F] hover:text-[#005c44] hover:bg-[#E6F6F2] px-2 gap-1"
                >
                  {shippingAddress ? (
                    <>
                      <Edit2 className="h-3 w-3" />
                      <span>Edit</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-3 w-3" />
                      <span>Add</span>
                    </>
                  )}
                </Button>
              )}
            </div>

            {shippingAddress ? (
              <div className="space-y-1 text-xs">
                {shippingAddress.contact_name && (
                  <div className="font-semibold text-[#0A0A0A]">
                    Recipient: {shippingAddress.contact_name}
                  </div>
                )}
                {shippingAddress.contact_phone && (
                  <div className="text-[#6B7272] font-mono">
                    Tel: {shippingAddress.contact_phone}
                  </div>
                )}
                <div className="text-[#0A0A0A] pt-0.5">
                  {shippingAddress.line1}
                  {shippingAddress.line2 ? `, ${shippingAddress.line2}` : ''}
                </div>
                <div className="text-[#6B7272]">
                  {shippingAddress.city}
                  {shippingAddress.state ? `, ${shippingAddress.state}` : ''}
                  {shippingAddress.postal_code ? ` ${shippingAddress.postal_code}` : ''}
                </div>
                <div className="text-xs font-medium text-[#0A0A0A]">
                  {shippingAddress.country}
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#6B7272] italic py-2">
                No shipping address recorded.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* Edit Guardian Sheet Modal                                             */}
      {/* ===================================================================== */}
      <Sheet open={guardianModalOpen} onOpenChange={setGuardianModalOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-6 flex flex-col justify-between">
          <div>
            <SheetHeader className="text-left mb-6">
              <SheetTitle className="text-lg font-semibold text-[#0A0A0A]">
                Edit Parent / Guardian
              </SheetTitle>
              <SheetDescription className="text-xs text-[#6B7272]">
                Update emergency contact or sponsor information for this candidate.
              </SheetDescription>
            </SheetHeader>

            <form id="form-edit-guardian" onSubmit={handleSaveGuardian} className="space-y-4">
              {guardianError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {guardianError}
                </div>
              )}

              <div>
                <Label htmlFor="gName" className="text-xs font-semibold text-[#0A0A0A]">
                  Guardian Full Name
                </Label>
                <Input
                  id="gName"
                  placeholder="e.g. Tariq Sharma"
                  value={gName}
                  onChange={(e) => setGName(e.target.value)}
                  className="mt-1 min-h-[44px]"
                  autoFocus
                />
              </div>

              <div>
                <Label htmlFor="gRelation" className="text-xs font-semibold text-[#0A0A0A]">
                  Relationship to Candidate
                </Label>
                <select
                  id="gRelation"
                  value={gRelation}
                  onChange={(e) => setGRelation(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E4E7E7] px-3 py-2 text-sm bg-white text-[#0A0A0A] min-h-[44px]"
                >
                  {GUARDIAN_RELATIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="gPhone" className="text-xs font-semibold text-[#0A0A0A]">
                  Guardian Phone Number
                </Label>
                <div className="mt-1">
                  <PhoneInput
                    value={gPhone}
                    onChange={setGPhone}
                    placeholder="50 987 6543"
                    defaultCountry="AE"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor="gWhatsapp" className="text-xs font-semibold text-[#0A0A0A]">
                    Guardian WhatsApp
                  </Label>
                  <label className="flex items-center gap-1.5 text-xs text-[#6B7272] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sameGWhatsapp}
                      onChange={(e) => setSameGWhatsapp(e.target.checked)}
                      className="rounded border-[#E4E7E7] text-[#00A57E] focus:ring-[#00A57E]"
                    />
                    <span>Same as phone</span>
                  </label>
                </div>
                {!sameGWhatsapp && (
                  <PhoneInput
                    value={gWhatsapp}
                    onChange={setGWhatsapp}
                    placeholder="50 987 6543"
                    defaultCountry="AE"
                  />
                )}
              </div>

              <div>
                <Label htmlFor="gEmail" className="text-xs font-semibold text-[#0A0A0A]">
                  Guardian Email
                </Label>
                <Input
                  id="gEmail"
                  type="email"
                  placeholder="guardian@example.com"
                  value={gEmail}
                  onChange={(e) => setGEmail(e.target.value)}
                  className="mt-1 min-h-[44px]"
                />
              </div>
            </form>
          </div>

          <div className="pt-6 border-t border-[#E4E7E7] flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setGuardianModalOpen(false)}
              className="min-h-[44px] px-4"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="form-edit-guardian"
              disabled={isPendingG}
              className="bg-[#00A57E] hover:bg-[#00805F] text-white min-h-[44px] px-5"
            >
              {isPendingG ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Guardian'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ===================================================================== */}
      {/* Edit Address Sheet Modal (Billing or Shipping)                        */}
      {/* ===================================================================== */}
      <Sheet open={addressModalOpen} onOpenChange={setAddressModalOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-6 flex flex-col justify-between">
          <div>
            <SheetHeader className="text-left mb-6">
              <SheetTitle className="text-lg font-semibold text-[#0A0A0A]">
                {activeAddressType === 'billing' ? 'Billing Address' : 'Shipping Address'}
              </SheetTitle>
              <SheetDescription className="text-xs text-[#6B7272]">
                {activeAddressType === 'billing'
                  ? 'Address printed on official Tax Invoices and Receipt Vouchers.'
                  : 'Address for certificate or document delivery.'}
              </SheetDescription>
            </SheetHeader>

            <form id="form-edit-address" onSubmit={handleSaveAddress} className="space-y-4">
              {addressError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {addressError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="aContactName" className="text-xs font-semibold text-[#0A0A0A]">
                    {activeAddressType === 'billing' ? 'Attn / Contact' : 'Recipient Name'}
                  </Label>
                  <Input
                    id="aContactName"
                    placeholder="e.g. Accounts or Parent"
                    value={aContactName}
                    onChange={(e) => setAContactName(e.target.value)}
                    className="mt-1 min-h-[44px]"
                  />
                </div>
                <div>
                  <Label htmlFor="aContactPhone" className="text-xs font-semibold text-[#0A0A0A]">
                    Contact Phone
                  </Label>
                  <Input
                    id="aContactPhone"
                    placeholder="+971 50 123 4567"
                    value={aContactPhone}
                    onChange={(e) => setAContactPhone(e.target.value)}
                    className="mt-1 min-h-[44px] font-mono text-sm"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="aLine1" className="text-xs font-semibold text-[#0A0A0A]">
                  Address Line 1 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="aLine1"
                  placeholder="Building, street, villa/apt no."
                  value={aLine1}
                  onChange={(e) => setALine1(e.target.value)}
                  className="mt-1 min-h-[44px]"
                  autoFocus
                />
              </div>

              <div>
                <Label htmlFor="aLine2" className="text-xs font-semibold text-[#0A0A0A]">
                  Address Line 2 (optional)
                </Label>
                <Input
                  id="aLine2"
                  placeholder="Area, landmark, floor"
                  value={aLine2}
                  onChange={(e) => setALine2(e.target.value)}
                  className="mt-1 min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="aCity" className="text-xs font-semibold text-[#0A0A0A]">
                    City <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="aCity"
                    placeholder="Dubai"
                    value={aCity}
                    onChange={(e) => setACity(e.target.value)}
                    className="mt-1 min-h-[44px]"
                  />
                </div>
                <div>
                  <Label htmlFor="aState" className="text-xs font-semibold text-[#0A0A0A]">
                    State / Emirate
                  </Label>
                  <Input
                    id="aState"
                    placeholder="e.g. Dubai, Abu Dhabi"
                    value={aState}
                    onChange={(e) => setAState(e.target.value)}
                    className="mt-1 min-h-[44px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="aCountry" className="text-xs font-semibold text-[#0A0A0A]">
                    Country <span className="text-red-500">*</span>
                  </Label>
                  <select
                    id="aCountry"
                    value={aCountry}
                    onChange={(e) => setACountry(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#E4E7E7] px-3 py-2 text-sm bg-white text-[#0A0A0A] min-h-[44px]"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="aPostalCode" className="text-xs font-semibold text-[#0A0A0A]">
                    Postal Code / PO Box
                  </Label>
                  <Input
                    id="aPostalCode"
                    placeholder="e.g. 12345"
                    value={aPostalCode}
                    onChange={(e) => setAPostalCode(e.target.value)}
                    className="mt-1 min-h-[44px]"
                  />
                </div>
              </div>
            </form>
          </div>

          <div className="pt-6 border-t border-[#E4E7E7] flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddressModalOpen(false)}
              className="min-h-[44px] px-4"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="form-edit-address"
              disabled={isPendingA}
              className="bg-[#00A57E] hover:bg-[#00805F] text-white min-h-[44px] px-5"
            >
              {isPendingA ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Address'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
