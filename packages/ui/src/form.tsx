/**
 * Form primitives — Field, Label, Input, Textarea, Select, Combobox, TagInput,
 * FieldGroup, FormErrors.
 *
 * All form primitives share the same border/focus contract: sharp edges
 * (rounded-none), zinc-800 border, emerald-500 focus ring. No floating labels —
 * labels are siblings rendered above the control via `<Field>` / `<Label>`.
 */

import {
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  useMemo,
  useState,
} from "react";
import { cx, textColor } from "./utils";

// ────────────── Field — wraps label + control + error ──────────────

export interface FieldProps {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  /** Explicit control id. If omitted, Field generates one and wires it to the
   *  single child control automatically so the label is always associated. */
  htmlFor?: string;
}

export function Field({ label, description, error, required, children, htmlFor }: FieldProps) {
  const generatedId = useId();
  const controlId = htmlFor ?? generatedId;

  // If the caller did not pass an explicit htmlFor, clone the single child
  // control and inject `id` so the <label htmlFor> association holds. This
  // keeps `<Field label="X"><Input/></Field>` accessible with no caller wiring.
  let control = children;
  if (!htmlFor && isValidElement(children)) {
    const childProps = children.props as { id?: string };
    if (!childProps.id) {
      control = cloneElement(children as ReactElement<{ id?: string }>, { id: controlId });
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <Label htmlFor={controlId} required={required}>
          {label}
        </Label>
      ) : null}
      {description ? <p className={cx("text-body-xs", textColor.muted)}>{description}</p> : null}
      {control}
      {error ? (
        <p
          className={cx(
            "data-mono font-mono text-mono-xs uppercase",
            "text-[color:var(--color-state-warn)]",
          )}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ────────────── Label ──────────────

export interface LabelProps {
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
}

export function Label({ htmlFor, required, children }: LabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={cx("data-mono font-mono text-mono-xs uppercase", textColor.muted)}
    >
      {children}
      {required ? (
        <span aria-hidden className={cx("ml-1", textColor.accent)}>
          *
        </span>
      ) : null}
    </label>
  );
}

// ────────────── Input ──────────────

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid}
      className={cx(
        "rounded-none border bg-[color:var(--color-surface-base)]",
        "px-3 py-2 text-body-sm",
        textColor.strong,
        invalid
          ? "border-[color:var(--color-state-error)]"
          : "border-[color:var(--color-border-subtle)]",
        "focus:border-[color:var(--color-accent-primary)] focus:outline-none",
        "placeholder:text-[color:var(--color-text-subtle)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
});

// ────────────── Textarea ──────────────

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, rows = 4, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid}
      className={cx(
        "rounded-none border bg-[color:var(--color-surface-base)]",
        "px-3 py-2 text-body-sm",
        textColor.strong,
        invalid
          ? "border-[color:var(--color-state-error)]"
          : "border-[color:var(--color-border-subtle)]",
        "focus:border-[color:var(--color-accent-primary)] focus:outline-none",
        "placeholder:text-[color:var(--color-text-subtle)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
});

// ────────────── Select ──────────────

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  invalid?: boolean;
  options?: ReadonlyArray<{ value: string; label: string }>;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className, options, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid}
      className={cx(
        "rounded-none border bg-[color:var(--color-surface-base)]",
        "px-3 py-2 text-body-sm",
        textColor.strong,
        invalid
          ? "border-[color:var(--color-state-error)]"
          : "border-[color:var(--color-border-subtle)]",
        "focus:border-[color:var(--color-accent-primary)] focus:outline-none",
        className,
      )}
      {...rest}
    >
      {options
        ? options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))
        : children}
    </select>
  );
});

// ────────────── Combobox — lightweight text input with autocomplete suggestions ──────────────

export interface ComboboxProps {
  value: string;
  onChange: (next: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
  invalid?: boolean;
  id?: string;
}

export function Combobox({ value, onChange, options, placeholder, invalid, id }: ComboboxProps) {
  const listId = useId();
  // A native <input list={…}> + <datalist> IS an accessible combobox — the
  // browser provides the combobox role + expansion semantics. We deliberately
  // do NOT add an explicit role="combobox" (which would then also require
  // aria-expanded state management we don't own).
  return (
    <div>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        invalid={invalid}
        list={listId}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </datalist>
    </div>
  );
}

// ────────────── TagInput — multi-value chip-style input ──────────────

export interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  id?: string;
}

export function TagInput({ value, onChange, placeholder, id }: TagInputProps) {
  const [draft, setDraft] = useState("");

  function commit(token: string) {
    const trimmed = token.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div
      className={cx(
        "flex flex-wrap items-center gap-2 rounded-none border bg-[color:var(--color-surface-base)] px-2 py-1.5",
        "border-[color:var(--color-border-subtle)] focus-within:border-[color:var(--color-accent-primary)]",
      )}
    >
      {value.map((t) => (
        <span
          key={t}
          className={cx(
            "inline-flex items-center gap-1 rounded-none border px-2 py-0.5",
            "data-mono font-mono text-mono-xs uppercase",
            "border-[color:var(--color-border-default)]",
            textColor.default,
          )}
        >
          {t}
          <button
            type="button"
            onClick={() => onChange(value.filter((v) => v !== t))}
            aria-label={`Remove ${t}`}
            className={cx("ml-1 text-mono-xs leading-none", textColor.muted)}
          >
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
        placeholder={placeholder}
        className={cx(
          "flex-1 bg-transparent px-1 py-1 text-body-sm outline-none",
          "placeholder:text-[color:var(--color-text-subtle)]",
          textColor.strong,
        )}
      />
    </div>
  );
}

// ────────────── FieldGroup ──────────────

export interface FieldGroupProps {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}

export function FieldGroup({ title, description, children }: FieldGroupProps) {
  return (
    <fieldset className="flex flex-col gap-4">
      {title ? (
        <legend className={cx("data-mono mb-2 font-mono text-mono-xs uppercase", textColor.accent)}>
          {title}
        </legend>
      ) : null}
      {description ? (
        <p className={cx("-mt-3 mb-2 text-body-sm", textColor.muted)}>{description}</p>
      ) : null}
      {children}
    </fieldset>
  );
}

// ────────────── FormErrors ──────────────

export interface FormErrorsProps {
  errors: ReadonlyArray<{ field?: string; message: string }>;
}

export function FormErrors({ errors }: FormErrorsProps) {
  const list = useMemo(() => errors.filter((e) => e.message), [errors]);
  if (list.length === 0) return null;
  return (
    <div
      role="alert"
      className={cx(
        "rounded-none border px-4 py-3",
        "border-[color:var(--color-state-error)]",
        "bg-[color:var(--color-state-errorSoft)]",
      )}
    >
      <div
        className={cx(
          "data-mono mb-2 font-mono text-mono-xs uppercase",
          "text-[color:var(--color-state-error)]",
        )}
      >
        ERR {"//"} {list.length} issue{list.length > 1 ? "s" : ""}
      </div>
      <ul className="flex flex-col gap-1">
        {list.map((e, i) => (
          <li key={`${e.field ?? ""}-${i}`} className={cx("text-body-sm", textColor.default)}>
            {e.field ? <span className={textColor.muted}>{e.field}: </span> : null}
            {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
