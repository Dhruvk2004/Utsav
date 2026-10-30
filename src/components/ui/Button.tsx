import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

/**
 * Buttons (design-system 6.1). One primary per view. `hero` and `hero-outline` sit on the brand
 * band, `inverse` only inside the toast, `google` keeps Google's own white button in both themes.
 */
export type ButtonVariant =
  "primary" | "accent" | "secondary" | "ghost" | "danger" | "danger-outline" | "inverse" | "google" | "hero" | "hero-outline";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-brand text-on-brand hover:bg-[color-mix(in_srgb,var(--color-brand)_86%,var(--color-fg))]",
  accent: "border-transparent bg-accent text-on-accent hover:bg-[color-mix(in_srgb,var(--color-accent)_88%,var(--color-fg))]",
  secondary: "border-line-strong bg-surface text-brand hover:border-brand",
  ghost: "border-transparent bg-transparent text-brand hover:bg-brand-tint",
  danger: "border-transparent bg-danger text-on-solid hover:bg-[color-mix(in_srgb,var(--color-danger)_86%,var(--color-fg))]",
  "danger-outline": "border-danger bg-transparent text-danger hover:bg-danger-tint",
  inverse:
    "border-transparent bg-transparent text-inverse-action hover:bg-[color-mix(in_srgb,var(--color-inverse-action)_14%,transparent)]",
  google: "border-google-line bg-google-bg text-google-fg hover:shadow-2",
  hero: "border-transparent bg-hero-fg text-hero-bg hover:bg-[color-mix(in_srgb,var(--color-hero-fg)_88%,var(--color-hero-bg))]",
  "hero-outline":
    "border-[color:color-mix(in_srgb,var(--color-hero-fg)_55%,transparent)] bg-transparent text-hero-fg hover:bg-[color-mix(in_srgb,var(--color-hero-fg)_10%,transparent)]",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-[13px]",
  md: "min-h-11 px-4 text-body-sm",
  lg: "min-h-13 px-[22px] text-[15px]",
};

const ICON_SIZES: Record<ButtonSize, string> = { sm: "size-9", md: "size-10 pointer-coarse:size-11", lg: "size-13" };

export interface ButtonStyle {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon-only button: square, and an `aria-label` is required by the caller. */
  iconOnly?: boolean;
  block?: boolean;
}

/** Class names for a button look, shared by `<Button>` and `<ButtonLink>`. */
export function buttonClasses({ variant = "primary", size = "md", iconOnly = false, block = false }: ButtonStyle = {}): string {
  return cx(
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md border font-semibold leading-none no-underline",
    "transition-[background-color,border-color,box-shadow] duration-[120ms] active:translate-y-px",
    "disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0 aria-disabled:cursor-not-allowed aria-disabled:opacity-45",
    VARIANTS[variant],
    iconOnly ? cx(ICON_SIZES[size], "p-0") : SIZES[size],
    block && "w-full",
  );
}

type ButtonProps = ComponentProps<"button"> &
  ButtonStyle & {
    /**
     * Keeps the label, swaps the leading icon for a spinner, sets aria-busy and ignores presses. It
     * uses aria-disabled, not `disabled`, so a keyboard user's focus stays on it (CO-01): a
     * disabled button drops focus to the page body.
     */
    loading?: boolean;
    icon?: ReactNode;
  };

export function Button({
  variant,
  size,
  iconOnly,
  block,
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  onClick,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(buttonClasses({ variant, size, iconOnly, block }), className)}
      disabled={disabled}
      aria-disabled={(loading && !disabled) || undefined}
      aria-busy={loading || undefined}
      onClick={(event) => {
        // A busy button does nothing, including submitting its form.
        if (loading) event.preventDefault();
        else onClick?.(event);
      }}
      {...props}
    >
      {loading ? <span className="spinner size-4" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> &
  ButtonStyle & {
    icon?: ReactNode;
    /**
     * Loads the page fresh. Public pages need this to reach an app page: a client-side move keeps the
     * document's stricter Content Security Policy, which blocks Google sign-in (src/lib/server/csp.ts).
     */
    fullLoad?: boolean;
  };

/** A link that looks like a button, for navigation actions such as "New event". */
export function ButtonLink({ variant, size, iconOnly, block, icon, className, children, fullLoad, ...props }: ButtonLinkProps) {
  if (fullLoad) {
    return (
      <a href={String(props.href)} className={cx(buttonClasses({ variant, size, iconOnly, block }), className)}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <Link className={cx(buttonClasses({ variant, size, iconOnly, block }), className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}
