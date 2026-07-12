import { Check, ChevronDown } from "lucide-react";
import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type NodeGuardSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type MenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

type NodeGuardSelectProps = {
  value: string;
  options: readonly NodeGuardSelectOption[];
  onChange: (value: string) => void;
  label: string;
  labelPosition?: "above" | "inline" | "hidden";
  className?: string;
  disabled?: boolean;
};

const openSelectEvent = "nodeguard:select-open";

function firstEnabled(options: readonly NodeGuardSelectOption[]) {
  return options.findIndex((option) => !option.disabled);
}

function lastEnabled(options: readonly NodeGuardSelectOption[]) {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index].disabled) return index;
  }
  return -1;
}

function adjacentEnabled(options: readonly NodeGuardSelectOption[], current: number, direction: 1 | -1) {
  if (options.length === 0) return -1;
  let next = current;
  for (let attempts = 0; attempts < options.length; attempts += 1) {
    next = (next + direction + options.length) % options.length;
    if (!options[next].disabled) return next;
  }
  return current;
}

export function NodeGuardSelect({
  value,
  options,
  onChange,
  label,
  labelPosition = "above",
  className = "",
  disabled = false
}: NodeGuardSelectProps) {
  const generatedId = useId().replaceAll(":", "");
  const triggerId = `nodeguard-select-${generatedId}`;
  const labelId = `${triggerId}-label`;
  const listboxId = `${triggerId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : options[firstEnabled(options)];

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    setMenuPosition(null);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const openMenu = (preferredIndex = selectedIndex) => {
    if (disabled || options.every((option) => option.disabled)) return;
    window.dispatchEvent(new CustomEvent(openSelectEvent, { detail: triggerId }));
    const initial = preferredIndex >= 0 && !options[preferredIndex]?.disabled
      ? preferredIndex
      : firstEnabled(options);
    setActiveIndex(initial);
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    if (option.value !== value) onChange(option.value);
    close(true);
  };

  useEffect(() => {
    const closeOtherSelects = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== triggerId) close(false);
    };
    window.addEventListener(openSelectEvent, closeOtherSelects);
    return () => window.removeEventListener(openSelectEvent, closeOtherSelects);
  }, [close, triggerId]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) close(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [close, open]);

  useLayoutEffect(() => {
    if (!open) return;

    const positionMenu = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportGap = 8;
      const menuGap = 6;
      const width = Math.min(Math.max(rect.width, 150), window.innerWidth - viewportGap * 2);
      const estimatedHeight = Math.min(options.length * 38 + 8, 288);
      const roomBelow = window.innerHeight - rect.bottom - viewportGap - menuGap;
      const roomAbove = rect.top - viewportGap - menuGap;
      const placeAbove = roomBelow < Math.min(estimatedHeight, 160) && roomAbove > roomBelow;
      const maxHeight = Math.max(96, Math.min(288, placeAbove ? roomAbove : roomBelow));
      const top = placeAbove
        ? Math.max(viewportGap, rect.top - Math.min(estimatedHeight, maxHeight) - menuGap)
        : Math.min(window.innerHeight - viewportGap, rect.bottom + menuGap);
      const left = Math.min(
        Math.max(viewportGap, rect.left),
        Math.max(viewportGap, window.innerWidth - width - viewportGap)
      );
      setMenuPosition({ top, left, width, maxHeight });
    };

    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    menuRef.current?.querySelector<HTMLElement>(`#${triggerId}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, triggerId]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "Escape" && open) {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      if (open) close(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      if (!open) {
        openMenu(selectedIndex >= 0 ? selectedIndex : direction === 1 ? firstEnabled(options) : lastEnabled(options));
      } else {
        setActiveIndex((current) => adjacentEnabled(options, current < 0 ? selectedIndex : current, direction));
      }
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const target = event.key === "Home" ? firstEnabled(options) : lastEnabled(options);
      if (!open) openMenu(target);
      else setActiveIndex(target);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) openMenu();
      else if (activeIndex >= 0) choose(activeIndex);
    }
  };

  const labelledBy = labelPosition === "hidden" ? undefined : `${labelId} ${triggerId}-value`;
  const menu = open && menuPosition ? createPortal(
    <div
      ref={menuRef}
      id={listboxId}
      className="nodeguard-select-menu"
      role="listbox"
      aria-labelledby={labelPosition === "hidden" ? undefined : labelId}
      aria-label={labelPosition === "hidden" ? label : undefined}
      style={{
        "--select-menu-top": `${menuPosition.top}px`,
        "--select-menu-left": `${menuPosition.left}px`,
        "--select-menu-width": `${menuPosition.width}px`,
        "--select-menu-max-height": `${menuPosition.maxHeight}px`
      } as CSSProperties}
    >
      {options.map((option, index) => (
        <div
          id={`${triggerId}-option-${index}`}
          className={`nodeguard-select-option ${index === activeIndex ? "is-active" : ""} ${option.value === value ? "is-selected" : ""}`}
          key={option.value}
          role="option"
          aria-selected={option.value === value}
          aria-disabled={option.disabled || undefined}
          onPointerMove={() => { if (!option.disabled) setActiveIndex(index); }}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => choose(index)}
        >
          <span>{option.label}</span>
          {option.value === value ? <Check size={14} aria-hidden="true" /> : null}
        </div>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div className={`nodeguard-select nodeguard-select--${labelPosition} ${open ? "is-open" : ""} ${className}`.trim()}>
      {labelPosition === "above" ? <span className="nodeguard-select-label" id={labelId}>{label}</span> : null}
      <button
        ref={triggerRef}
        id={triggerId}
        className="nodeguard-select-trigger"
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${triggerId}-option-${activeIndex}` : undefined}
        aria-labelledby={labelledBy}
        aria-label={labelPosition === "hidden" ? label : undefined}
        disabled={disabled}
        onClick={() => open ? close(false) : openMenu()}
        onKeyDown={handleKeyDown}
      >
        {labelPosition === "inline" ? <span className="nodeguard-select-prefix" id={labelId}>{label}</span> : null}
        <span className="nodeguard-select-value" id={`${triggerId}-value`}>{selectedOption?.label ?? "Select"}</span>
        <ChevronDown className="nodeguard-select-chevron" size={14} aria-hidden="true" />
      </button>
      {menu}
    </div>
  );
}
