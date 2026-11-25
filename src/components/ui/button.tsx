import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-ink-foreground shadow-card hover:opacity-90",
        accent: "bg-accent text-accent-foreground shadow-card hover:bg-accent-hover",
        outline: "border border-border bg-surface text-foreground shadow-card hover:border-border-strong hover:bg-surface-muted",
        soft: "border border-accent/30 bg-accent-soft text-accent-soft-foreground hover:border-accent/60",
        ghost: "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-5 text-[15px]",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type Variants = VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ComponentProps<"button"> & Variants) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function ButtonLink({
  className,
  variant,
  size,
  external,
  ...props
}: ComponentProps<typeof Link> & Variants & { external?: boolean }) {
  const ext = external ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...ext} {...props} />;
}
