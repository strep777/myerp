import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-lg border border-input bg-white px-3 py-1 text-sm text-foreground shadow-[0_1px_1px_rgba(15,23,42,0.02)] transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:bg-secondary/60 disabled:opacity-70 aria-[invalid=true]:border-destructive/70 aria-[invalid=true]:focus-visible:ring-destructive/15",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      "flex min-h-[76px] w-full resize-y rounded-lg border border-input bg-white px-3 py-2 text-sm leading-6 text-foreground shadow-[0_1px_1px_rgba(15,23,42,0.02)] transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:bg-secondary/60 disabled:opacity-70 aria-[invalid=true]:border-destructive/70",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = "Textarea";

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn("text-[13px] font-medium leading-none text-foreground", className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Input, Textarea, Label };
