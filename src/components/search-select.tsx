"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";

type SearchOption = {
  value: string;
  label: string;
  meta?: string;
};

export function SearchSelect({
  defaultValue,
  disabled,
  emptyText = "No matches",
  name,
  options,
  placeholder
}: {
  defaultValue?: string | null;
  disabled?: boolean;
  emptyText?: string;
  name: string;
  options: SearchOption[];
  placeholder: string;
}) {
  const selectedOption = options.find((option) => option.value === defaultValue);
  const [selectedValue, setSelectedValue] = useState(defaultValue ?? "");
  const [query, setQuery] = useState(selectedOption?.label ?? "");
  const [open, setOpen] = useState(false);

  const visibleOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options.slice(0, 30);

    return options
      .filter((option) => {
        return `${option.label} ${option.meta ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .slice(0, 30);
  }, [options, query]);

  function selectOption(option: SearchOption) {
    setSelectedValue(option.value);
    setQuery(option.label);
    setOpen(false);
  }

  function updateQuery(value: string) {
    setQuery(value);
    setOpen(true);
    if (
      selectedValue &&
      options.find((option) => option.value === selectedValue)?.label !== value
    ) {
      setSelectedValue("");
    }
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selectedValue} />
      <div
        className={cn(
          "flex h-10 items-center gap-2 rounded-md border border-[--color-border] bg-[--color-surface-2] px-3",
          "transition-colors duration-150 focus-within:border-[--color-accent]/60 focus-within:bg-[--color-surface-3]",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <Search size={14} className="shrink-0 text-[--color-faint]" />
        <input
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-sm text-[--color-text] outline-none placeholder:text-[--color-faint]"
          disabled={disabled}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
          onChange={(event) => updateQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          value={query}
        />
        <ChevronDown size={14} className="shrink-0 text-[--color-faint]" />
      </div>

      {open && !disabled ? (
        <div className="absolute left-0 right-0 top-11 z-20 max-h-72 overflow-y-auto rounded-md border border-[--color-border] bg-[--color-surface] shadow-2xl">
          {visibleOptions.length === 0 ? (
            <p className="px-3 py-3 text-sm text-[--color-muted]">{emptyText}</p>
          ) : (
            visibleOptions.map((option) => {
              const selected = option.value === selectedValue;
              return (
                <button
                  key={option.value}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-[--color-surface-2]"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[--color-text]">
                      {option.label}
                    </span>
                    {option.meta ? (
                      <span className="block truncate text-xs text-[--color-muted]">
                        {option.meta}
                      </span>
                    ) : null}
                  </span>
                  {selected ? (
                    <Check size={14} className="shrink-0 text-[--color-accent]" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
