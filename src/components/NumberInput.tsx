import * as React from "react";
import { cn } from "@/lib/utils";

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> {
  value: number | string;
  onValueChange: (value: number) => void;
}

/**
 * A number input that properly handles leading zeros.
 * Shows empty string when value is 0 (so user can type fresh),
 * and strips leading zeros on change.
 */
const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, value, onValueChange, ...props }, ref) => {
    const [localValue, setLocalValue] = React.useState(() => {
      const n = Number(value);
      return n === 0 ? "" : String(n);
    });
    const isFocused = React.useRef(false);

    // Sync from parent only when not focused (external changes)
    React.useEffect(() => {
      if (isFocused.current) return;
      const n = Number(value);
      setLocalValue(n === 0 ? "" : String(n));
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      
      // Allow empty
      if (raw === "" || raw === "-") {
        setLocalValue(raw);
        onValueChange(0);
        return;
      }

      // Allow partial decimal input like "5."
      if (raw.endsWith(".") && raw.split(".").length === 2) {
        setLocalValue(raw);
        onValueChange(parseFloat(raw) || 0);
        return;
      }

      const num = parseFloat(raw);
      if (!isNaN(num)) {
        setLocalValue(String(num));
        onValueChange(num);
      }
    };

    return (
      <input
        type="number"
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        value={localValue}
        onChange={handleChange}
        onFocus={() => { isFocused.current = true; }}
        onBlur={() => {
          isFocused.current = false;
          const n = Number(value);
          setLocalValue(n === 0 ? "" : String(n));
        }}
        {...props}
      />
    );
  }
);
NumberInput.displayName = "NumberInput";

export { NumberInput };
