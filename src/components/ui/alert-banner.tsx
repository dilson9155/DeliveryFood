"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/format";

export type AlertBannerType = "success" | "error" | "info" | "warning";

export type AlertBannerItem = {
  id: number;
  type: AlertBannerType;
  title?: string;
  message: string;
  /** Detalhes formatados extra (ex.: contadores) */
  details?: Array<{ label: string; value: string | number }>;
  /** Persistência em ms (0 = até fechar manualmente) */
  duration?: number;
};

type BannerContextType = {
  show: (input: Omit<AlertBannerItem, "id"> & { duration?: number }) => void;
};

const Ctx = createContext<BannerContextType>({ show: () => {} });

export function useAlertBanner() {
  return useContext(Ctx);
}

const icons: Record<AlertBannerType, React.ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-success" />,
  error: <AlertCircle className="h-5 w-5 text-danger" />,
  info: <Info className="h-5 w-5 text-info" />,
  warning: <AlertTriangle className="h-5 w-5 text-warning" />,
};

const tones: Record<AlertBannerType, string> = {
  success: "border-success/30 bg-success/10",
  error: "border-danger/30 bg-danger/10",
  info: "border-info/30 bg-info/10",
  warning: "border-warning/30 bg-warning/10",
};

const titleTones: Record<AlertBannerType, string> = {
  success: "text-success",
  error: "text-danger",
  info: "text-info",
  warning: "text-warning",
};

export function AlertBannerStack({
  banners,
  onClose,
}: {
  banners: AlertBannerItem[];
  onClose: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 p-3 sm:p-4">
      {banners.map((b) => (
        <AlertBanner key={b.id} banner={b} onClose={onClose} />
      ))}
    </div>
  );
}

function AlertBanner({
  banner,
  onClose,
}: {
  banner: AlertBannerItem;
  onClose: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!banner.duration || banner.duration === 0) return;
    const id = window.setTimeout(() => onClose(banner.id), banner.duration);
    return () => window.clearTimeout(id);
  }, [banner.id, banner.duration, onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto w-full max-w-xl rounded-2xl border bg-card px-4 py-3 shadow-lg shadow-black/5 backdrop-blur-sm animate-fade-in",
        tones[banner.type]
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{icons[banner.type]}</div>
        <div className="min-w-0 flex-1">
          {banner.title && (
            <p className={cn("text-sm font-semibold", titleTones[banner.type])}>
              {banner.title}
            </p>
          )}
          <p className="text-sm text-foreground">{banner.message}</p>
          {banner.details && banner.details.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {expanded ? "Ocultar detalhes" : `Ver detalhes (${banner.details.length})`}
              </button>
              {expanded && (
                <ul className="mt-2 space-y-0.5 rounded-xl border border-border bg-background/60 p-2 text-xs text-muted-foreground">
                  {banner.details.map((d, i) => (
                    <li key={i} className="flex items-center justify-between gap-3">
                      <span className="truncate">{d.label}</span>
                      <span className="font-mono text-foreground">{d.value}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => onClose(banner.id)}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function AlertBannerProvider({ children }: { children: React.ReactNode }) {
  const [banners, setBanners] = useState<AlertBannerItem[]>([]);
  const idRef = useRef(0);

  const show = useCallback((input: Omit<AlertBannerItem, "id"> & { duration?: number }) => {
    const id = ++idRef.current;
    const { duration = 5000, ...rest } = input;
    setBanners((prev) => [...prev, { id, duration, ...rest }]);
  }, []);

  const close = useCallback((id: number) => {
    setBanners((prev) => prev.filter((b) => b.id !== id));
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <AlertBannerStack banners={banners} onClose={close} />
    </Ctx.Provider>
  );
}
