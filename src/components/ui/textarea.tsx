import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-xl border border-[#E4E7E7] bg-white px-3 py-2.5 text-base sm:text-sm text-[#0A0A0A] placeholder:text-[#6B7272] transition-colors outline-none focus-visible:border-[#00A57E] focus-visible:ring-2 focus-visible:ring-[#00A57E]/20 disabled:cursor-not-allowed disabled:bg-[#F5F6F6] disabled:text-[#6B7272] disabled:opacity-75 aria-invalid:border-[#C53030] aria-invalid:ring-2 aria-invalid:ring-[#C53030]/20",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
