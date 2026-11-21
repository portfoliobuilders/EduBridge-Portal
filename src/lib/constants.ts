export const COUNTRIES = [
  'United Arab Emirates',
  'India',
  'Saudi Arabia',
  'Oman',
  'Qatar',
  'Kuwait',
  'Bahrain',
  'United Kingdom',
  'United States',
  'Canada',
  'Australia',
  'Pakistan',
  'Egypt',
  'Jordan',
  'Lebanon',
  'Philippines',
  'Other',
] as const

export type Country = typeof COUNTRIES[number]

export const GUARDIAN_RELATIONS = [
  { value: 'father', label: 'Father' },
  { value: 'mother', label: 'Mother' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'other', label: 'Other' },
] as const

export type GuardianRelation = typeof GUARDIAN_RELATIONS[number]['value']
