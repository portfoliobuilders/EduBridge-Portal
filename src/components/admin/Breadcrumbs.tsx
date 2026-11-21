import React from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center text-xs md:text-sm text-muted-foreground mb-4 overflow-x-auto whitespace-nowrap scrollbar-none">
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        return (
          <React.Fragment key={index}>
            {index > 0 && <ChevronRight className="w-3.5 h-3.5 mx-1.5 shrink-0 text-muted-foreground/50" />}
            {isLast || !item.href ? (
              <span className="font-semibold text-foreground truncate max-w-[200px] md:max-w-[300px]">
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="hover:text-primary transition-colors truncate max-w-[150px] md:max-w-[200px]"
              >
                {item.label}
              </Link>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
