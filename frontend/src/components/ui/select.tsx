import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  options: SelectOption[];
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  "aria-invalid"?: boolean;
}

const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  (
    { value, onValueChange, placeholder = "请选择", options, disabled, className, id, name, ...aria },
    ref,
  ) => (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled} name={name}>
      <SelectPrimitive.Trigger
        ref={ref}
        id={id}
        aria-invalid={aria["aria-invalid"]}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-white px-3 text-left text-sm shadow-[0_1px_1px_rgba(15,23,42,0.02)] transition-colors data-[placeholder]:text-muted-foreground/70 focus:border-primary/60 focus:outline-none focus:ring-[3px] focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-secondary/60 disabled:opacity-70 [&>span]:truncate",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground/80" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={5}
          className="relative z-[70] max-h-[min(340px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-black/[0.08] bg-popover text-popover-foreground shadow-popover data-[state=open]:animate-scale-in"
        >
          <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-muted-foreground">
            <ChevronUp className="h-4 w-4" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1">
            {options.length === 0 ? (
              <div className="px-3 py-5 text-center text-[12px] text-muted-foreground">没有可选项</div>
            ) : (
              options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="relative flex h-8 cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-3 text-[13px] outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50"
                >
                  <span className="absolute left-2.5 flex h-3.5 w-3.5 items-center justify-center">
                    <SelectPrimitive.ItemIndicator>
                      <Check className="h-3.5 w-3.5 text-primary" />
                    </SelectPrimitive.ItemIndicator>
                  </span>
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))
            )}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-muted-foreground">
            <ChevronDown className="h-4 w-4" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  ),
);
Select.displayName = "Select";

export { Select };
