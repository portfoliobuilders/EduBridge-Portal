'use client'

import React, { useState, useMemo } from 'react'
import {
  parsePhoneNumberFromString,
  AsYouType,
  getCountryCallingCode,
  type CountryCode,
} from 'libphonenumber-js'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'

interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string
  onChange: (value: string) => void
  defaultCountry?: CountryCode
  error?: string
}

const SUPPORTED_COUNTRIES: { code: CountryCode; name: string; flag: string }[] = [
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'OM', name: 'Oman', flag: '🇴🇲' },
  { code: 'QA', name: 'Qatar', flag: '🇶🇦' },
  { code: 'BH', name: 'Bahrain', flag: '🇧🇭' },
  { code: 'KW', name: 'Kuwait', flag: '🇰🇼' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'EG', name: 'Egypt', flag: '🇪🇬' },
  { code: 'JO', name: 'Jordan', flag: '🇯🇴' },
  { code: 'LB', name: 'Lebanon', flag: '🇱🇧' },
]

export function PhoneInput({
  value,
  onChange,
  defaultCountry = 'AE',
  className,
  error,
  disabled,
  placeholder = '58 107 3898',
  ...props
}: PhoneInputProps) {
  // Determine country from value or default
  const [country, setCountry] = useState<CountryCode>(() => {
    if (value && value.startsWith('+')) {
      const parsed = parsePhoneNumberFromString(value)
      if (parsed?.country) return parsed.country
    }
    return defaultCountry
  })

  // Format the national portion from incoming value
  const nationalDisplay = useMemo(() => {
    if (!value) return ''
    const parsed = parsePhoneNumberFromString(value, country)
    if (parsed) {
      // Return only the national number formatted (e.g. "58 107 3898")
      return parsed.formatNational().replace(/^0/, '') // strip leading trunk prefix if present
    }
    // If not parseable as full number, strip calling code if user passed it
    try {
      const code = getCountryCallingCode(country)
      const clean = value.replace(/^\+/, '')
      if (clean.startsWith(code)) {
        return clean.slice(code.length).trim()
      }
    } catch {}
    return value.replace(/^\+\d+\s*/, '')
  }, [value, country])

  const [localInput, setLocalInput] = useState(nationalDisplay)
  const [prevNationalDisplay, setPrevNationalDisplay] = useState(nationalDisplay)

  if (nationalDisplay !== prevNationalDisplay) {
    setPrevNationalDisplay(nationalDisplay)
    setLocalInput(nationalDisplay)
  }

  const callingCode = useMemo(() => {
    try {
      return `+${getCountryCallingCode(country)}`
    } catch {
      return '+971'
    }
  }, [country])

  const handleCountryChange = (newCountry: string | null) => {
    if (!newCountry) return
    const c = newCountry as CountryCode
    setCountry(c)
    // Recompute E.164 with new country
    const rawDigits = localInput.replace(/\D/g, '')
    if (rawDigits) {
      try {
        const newCode = getCountryCallingCode(c)
        onChange(`+${newCode}${rawDigits}`)
      } catch {
        onChange(localInput)
      }
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value

    // If user somehow pasted an E.164 number with "+", detect country
    if (raw.startsWith('+')) {
      const parsed = parsePhoneNumberFromString(raw)
      if (parsed?.country) {
        setCountry(parsed.country)
        const nat = parsed.formatNational().replace(/^0/, '')
        setLocalInput(nat)
        onChange(parsed.number)
        return
      }
    }

    // Strip leading 0 or country code if typed inside the national box
    try {
      const code = getCountryCallingCode(country)
      if (raw.startsWith(code)) {
        raw = raw.slice(code.length)
      }
    } catch {}

    // Format national number as-you-type
    const asYouType = new AsYouType(country)
    const formatted = asYouType.input(raw)
    setLocalInput(formatted)

    const rawDigits = raw.replace(/\D/g, '')
    if (!rawDigits) {
      onChange('')
      return
    }

    const parsed = parsePhoneNumberFromString(rawDigits, country)
    if (parsed && parsed.isValid()) {
      onChange(parsed.number) // valid E.164
    } else {
      try {
        const code = getCountryCallingCode(country)
        onChange(`+${code}${rawDigits}`)
      } catch {
        onChange(rawDigits)
      }
    }
  }

  const selectedCountryObj = SUPPORTED_COUNTRIES.find((c) => c.code === country) || {
    code: country,
    name: country,
    flag: '🌐',
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        {/* Country Selector Trigger */}
        <div className="shrink-0 w-[110px]">
          <Select
            value={country}
            onValueChange={handleCountryChange}
            disabled={disabled}
          >
            <SelectTrigger
              className="h-12 sm:h-11 px-2.5 bg-white border-[#E4E7E7] text-xs font-medium text-[#0A0A0A] rounded-xl shadow-none"
              aria-label="Country Code"
            >
              <div className="flex items-center gap-1 truncate">
                <span className="text-base leading-none">{selectedCountryObj.flag}</span>
                <span className="font-mono text-xs">{callingCode}</span>
              </div>
            </SelectTrigger>
            <SelectContent className="max-h-60 w-56 bg-white border-[#E4E7E7] shadow-xl rounded-[14px]">
              {SUPPORTED_COUNTRIES.map((c) => {
                let codeStr = ''
                try {
                  codeStr = `+${getCountryCallingCode(c.code)}`
                } catch {}
                return (
                  <SelectItem key={c.code} value={c.code} className="text-xs py-2">
                    <span className="mr-2 text-sm">{c.flag}</span>
                    <span className="font-medium mr-1.5">{c.name}</span>
                    <span className="text-[#6B7272] font-mono ml-auto">{codeStr}</span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>

        {/* National Number Input (ONLY national digits, e.g. "58 107 3898") */}
        <div className="flex-1 min-w-0">
          <Input
            type="tel"
            value={localInput}
            onChange={handleInputChange}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              'tabular-nums font-mono text-base sm:text-sm bg-white border-[#E4E7E7] focus-visible:border-[#00A57E] focus-visible:ring-[#00A57E]/20',
              error && 'border-[#C53030] focus-visible:ring-[#C53030]/20',
              className
            )}
            {...props}
          />
        </div>
      </div>
      {error && <p className="text-xs text-[#C53030] mt-1.5 font-medium">{error}</p>}
    </div>
  )
}
