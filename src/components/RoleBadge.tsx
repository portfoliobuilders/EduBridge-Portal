import React from 'react'
import { cn } from '@/lib/utils'

export type RoleType = 'super_admin' | 'admin' | 'staff' | 'owner' | string

interface RoleBadgeProps {
  role: RoleType
  className?: string
  size?: 'sm' | 'md'
}

export function RoleBadge({ role, className, size = 'sm' }: RoleBadgeProps) {
  const normalized = role === 'owner' ? 'super_admin' : role

  const label =
    normalized === 'super_admin'
      ? 'Super Admin'
      : normalized === 'admin'
      ? 'Admin'
      : 'Staff'

  const styles =
    normalized === 'super_admin'
      ? 'bg-[#00805F] text-white border-transparent'
      : normalized === 'admin'
      ? 'bg-[#E6F6F2] text-[#00A57E] border-[#00A57E]'
      : 'bg-[#F5F6F6] text-[#6B7272] border-[#E4E7E7]'

  const sizeStyles =
    size === 'sm'
      ? 'px-2 py-0.5 text-[10px]'
      : 'px-2.5 py-1 text-xs'

  return (
    <span
      className={cn(
        'inline-flex items-center font-semibold rounded-full border tracking-wide uppercase whitespace-nowrap shrink-0',
        styles,
        sizeStyles,
        className
      )}
    >
      {label}
    </span>
  )
}
