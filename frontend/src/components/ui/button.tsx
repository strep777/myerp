import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[13px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.985] [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-button hover:bg-[#0071e8] active:bg-[#0068d6]",
        secondary:
          "border border-black/[0.08] bg-white text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-[#f7f7f9] active:bg-[#f2f2f5]",
        outline:
          "border border-black/[0.1] bg-transparent text-foreground hover:bg-black/[0.035]",
        ghost: "text-foreground hover:bg-black/[0.05] active:bg-black/[0.07]",
        subtle: "bg-secondary text-secondary-foreground hover:bg-[#ececf0]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-button hover:bg-[#e5484d] active:bg-[#d93d42]",
        "destructive-ghost":
          "text-destructive hover:bg-red-50 active:bg-red-100",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 rounded-md px-3 text-[12px]",
        lg: "h-10 rounded-lg px-5 text-sm",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8 rounded-md",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, disabled, children, ...props }, ref) => {
    if (asChild) {
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </Slot>
      );
    }
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
