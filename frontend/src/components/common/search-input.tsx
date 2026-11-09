import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "搜索…",
  className,
  onSubmit,
  autoFocus,
}: SearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSubmit?.();
        }}
        placeholder={placeholder}
        className="h-9 pl-9 pr-9"
        autoFocus={autoFocus}
        aria-label={placeholder}
      />
      {value ? (
        <button
          type="button"
          aria-label="清除搜索"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-black/[0.05] hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
