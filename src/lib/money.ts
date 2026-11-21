/**
 * Format currency to EduBridge standard: "AED 12,500.00"
 */
export function formatMoney(val: number | string | null | undefined): string {
  const num = typeof val === 'string' ? parseFloat(val) : (val ?? 0)
  if (isNaN(num)) return 'AED 0.00'
  return `AED ${num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export const formatAED = formatMoney
