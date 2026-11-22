'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

export interface ComboboxItem {
  value: string
  label: string
  sublabel?: string
  disabled?: boolean
}

export interface ComboboxProps {
  items: ComboboxItem[]
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  id?: string
}

export function Combobox({
  items,
  value,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyText = 'No results found',
  disabled = false,
  className,
  id,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const selectedItem = React.useMemo(
    () => items.find((item) => item.value === value),
    [items, value]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'w-full h-12 sm:h-11 justify-between bg-white text-[#0A0A0A] border-[#E4E7E7] rounded-xl px-3 py-2 text-base sm:text-sm font-normal text-left shadow-none transition-colors hover:bg-white focus-visible:border-[#00A57E] focus-visible:ring-2 focus-visible:ring-[#00A57E]/20 disabled:cursor-not-allowed disabled:bg-[#F5F6F6] disabled:text-[#6B7272] disabled:opacity-75',
              !value && 'text-[#6B7272]',
              className
            )}
          />
        }
      >
        <span className="truncate">
          {selectedItem ? (
            <span>
              {selectedItem.label}
              {selectedItem.sublabel && (
                <span className="ml-1.5 text-xs text-[#6B7272]">
                  {selectedItem.sublabel}
                </span>
              )}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-[#6B7272]" />
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--anchor-width)] min-w-[280px] p-0 bg-white border-[#E4E7E7] shadow-xl rounded-[14px] overflow-hidden"
        align="start"
      >
        <Command className="w-full">
          <div className="flex items-center border-b border-[#E4E7E7] px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 text-[#6B7272]" />
            <CommandInput
              placeholder={searchPlaceholder}
              className="h-10 text-sm border-0 focus:ring-0 px-0"
            />
          </div>
          <CommandList className="max-h-60 overflow-y-auto p-1">
            <CommandEmpty className="py-4 text-center text-xs text-[#6B7272]">
              {emptyText}
            </CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.value}
                  value={`${item.label} ${item.sublabel ?? ''}`}
                  disabled={item.disabled}
                  onSelect={() => {
                    onChange(item.value)
                    setOpen(false)
                  }}
                  className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm text-[#0A0A0A] hover:bg-[#E6F6F2] hover:text-[#00805F] cursor-pointer"
                >
                  <div className="flex flex-col truncate pr-2">
                    <span className="truncate font-medium">{item.label}</span>
                    {item.sublabel && (
                      <span className="text-xs text-[#6B7272] truncate">
                        {item.sublabel}
                      </span>
                    )}
                  </div>
                  {value === item.value && (
                    <Check className="h-4 w-4 shrink-0 text-[#00A57E]" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
