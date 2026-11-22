import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-12 sm:h-11 w-full min-w-0 rounded-xl border border-[#E4E7E7] bg-white px-3 py-2 text-base sm:text-sm text-[#0A0A0A] placeholder:text-[#6B7272] transition-colors outline-none focus-visible:border-[#00A57E] focus-visible:ring-2 focus-visible:ring-[#00A57E]/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[#F5F6F6] disabled:text-[#6B7272] disabled:opacity-75 aria-invalid:border-[#C53030] aria-invalid:ring-2 aria-invalid:ring-[#C53030]/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
