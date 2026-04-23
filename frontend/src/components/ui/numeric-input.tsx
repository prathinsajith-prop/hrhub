import * as React from "react"

import { Input } from "./input"

export interface NumericInputProps
    extends Omit<React.ComponentProps<"input">, "type"> {
    /** Allow a single decimal point. Defaults to true. */
    decimal?: boolean
    /** Allow a leading minus sign. Defaults to false. */
    allowNegative?: boolean
    /** Maximum number of digits after the decimal point. */
    maxDecimals?: number
}

/**
 * Numeric input that uses `type="text"` under the hood so browsers don't
 * insert their own spinners or accept characters like `e` / `+`. We sanitize
 * keystrokes ourselves and surface a normal `change` event with the cleaned
 * string, so existing call sites that read `e.target.value` keep working.
 */
const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
    ({ decimal = true, allowNegative = false, maxDecimals, onChange, inputMode, ...rest }, ref) => {
        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const original = e.target.value
            let v = original
            const negative = allowNegative && v.startsWith("-")
            if (negative) v = v.slice(1)

            // Strip everything except digits (and optionally a decimal point).
            v = decimal ? v.replace(/[^\d.]/g, "") : v.replace(/\D/g, "")

            // Collapse multiple decimal points into one.
            if (decimal) {
                const parts = v.split(".")
                if (parts.length > 2) v = `${parts[0]}.${parts.slice(1).join("")}`
                if (typeof maxDecimals === "number" && parts.length === 2) {
                    v = `${parts[0]}.${parts[1].slice(0, maxDecimals)}`
                }
            }

            const sanitized = negative ? `-${v}` : v
            if (sanitized !== original) {
                e.target.value = sanitized
            }
            onChange?.(e)
        }

        return (
            <Input
                ref={ref}
                type="text"
                inputMode={inputMode ?? (decimal ? "decimal" : "numeric")}
                onChange={handleChange}
                {...rest}
            />
        )
    },
)
NumericInput.displayName = "NumericInput"

export { NumericInput }
