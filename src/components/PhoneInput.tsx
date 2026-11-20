'use client'

import React from 'react'
import { parsePhoneNumberFromString, AsYouType, CountryCode } from 'libphonenumber-js'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string
  onChange: (value: string) => void
  defaultCountry?: CountryCode
  error?: string
}

export function PhoneInput({
  value,
  onChange,
  defaultCountry = 'AE',
  className,
  error,
  ...props
}: PhoneInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const asYouType = new AsYouType(defaultCountry)
    const formatted = asYouType.input(raw)

    // Normalize to E.164 if valid or preserve raw formatted
    const parsed = parsePhoneNumberFromString(raw, defaultCountry)
    if (parsed && parsed.isValid()) {
      onChange(parsed.number)
    } else {
      onChange(formatted)
    }
  }

  return (
    <div className="w-full">
      <div className="relative flex items-center">
        <span className="absolute left-3 text-xs font-medium text-muted-foreground select-none pointer-events-none">
          🇦🇪 +971
        </span>
        <Input
          type="tel"
          value={value}
          onChange={handleChange}
          placeholder="58 107 3898"
          className={cn('pl-20 tabular-nums font-mono text-sm', error && 'border-destructive focus-visible:ring-destructive', className)}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  )
}
