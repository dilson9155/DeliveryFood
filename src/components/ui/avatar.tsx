"use client";

import { useState } from "react";
import { cn } from "@/lib/format";

export type AvatarProps = {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Mostrar borda (default true) */
  ring?: boolean;
  /** Sutil: ícone online, etc. */
  online?: boolean;
};

const sizes: Record<NonNullable<AvatarProps["size"]>, { box: string; text: string; dot: string }> = {
  sm: { box: "h-7 w-7", text: "text-[11px]", dot: "h-2 w-2 right-0 bottom-0" },
  md: { box: "h-9 w-9", text: "text-sm", dot: "h-2.5 w-2.5 right-0 bottom-0" },
  lg: { box: "h-12 w-12", text: "text-base", dot: "h-3 w-3 right-0.5 bottom-0.5" },
  xl: { box: "h-20 w-20", text: "text-xl", dot: "h-3.5 w-3.5 right-1 bottom-1" },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

/**
 * Avatar com imagem opcional e fallback em iniciais.
 * Se a imagem quebrar, mostra a inicial.
 */
export function Avatar({
  name,
  src,
  size = "md",
  className,
  ring = true,
  online,
}: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImg = !!src && !failed;
  const s = sizes[size];

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-100 to-brand-200 font-bold text-brand-700",
        ring && "ring-1 ring-border",
        s.box,
        className
      )}
      title={name}
      aria-label={name}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt={name}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className={cn("select-none", s.text)} aria-hidden>
          {initials(name)}
        </span>
      )}
      {online && (
        <span
          className={cn(
            "absolute rounded-full border-2 border-card bg-success",
            s.dot
          )}
          aria-hidden
        />
      )}
    </span>
  );
}
