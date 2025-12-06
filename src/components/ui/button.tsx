import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

// I need to create lib/utils first, but I'll define it here or create it next.
// I'll create lib/utils in the next step.

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-70 disabled:cursor-not-allowed",
    {
        variants: {
            variant: {
                default: "bg-brand-gold text-brand-brown hover:bg-brand-gold/90 shadow-sm font-bold tracking-wide",
                destructive: "bg-red-500 text-slate-50 hover:bg-red-500/90",
                outline: "border border-brand-brown/20 bg-transparent hover:bg-brand-brown/5 text-brand-brown",
                secondary: "bg-brand-sand text-brand-brown hover:bg-brand-sand/80",
                ghost: "hover:bg-brand-brown/5 hover:text-brand-brown",
                link: "text-brand-brown underline-offset-4 hover:underline",
            },
            size: {
                default: "h-11 px-8 py-2", /* Larger vertical padding for pill feel */
                sm: "h-9 rounded-full px-4",
                lg: "h-12 rounded-full px-10 text-base",
                icon: "h-10 w-10",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button"
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }
