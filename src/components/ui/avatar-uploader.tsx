"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, X, Loader2, User } from "lucide-react";
import { cn } from "@/lib/format";
import { Button } from "./button";
import { Avatar } from "./avatar";

const MAX_BYTES = 512 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export type AvatarUploaderProps = {
  name: string;
  currentUrl: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  label?: string;
  onChange: (dataUrl: string | null) => Promise<{ ok: boolean; error?: string }>;
  /** Se true, mostra botão "Remover" */
  showRemove?: boolean;
  className?: string;
};

/**
 * Uploader de avatar com preview, validação e remoção.
 * Componente controlado: o pai passa a URL atual e recebe o data-url após salvar.
 */
export function AvatarUploader({
  name,
  currentUrl,
  size = "xl",
  label = "Foto do usuário",
  onChange,
  showRemove = true,
  className,
}: AvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFile(file: File | null) {
    setError(null);
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      setError("Formato inválido. Use PNG, JPG, WebP ou GIF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("A imagem deve ter no máximo 512 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result ?? "");
      setPreview(dataUrl);
      startTransition(async () => {
        const res = await onChange(dataUrl);
        if (!res.ok) {
          setError(res.error ?? "Falha ao salvar.");
          setPreview(currentUrl);
        }
      });
    };
    reader.onerror = () => setError("Não foi possível ler o arquivo.");
    reader.readAsDataURL(file);
  }

  function remove() {
    setError(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
    startTransition(async () => {
      const res = await onChange(null);
      if (!res.ok) {
        setError(res.error ?? "Falha ao remover.");
        setPreview(currentUrl);
      }
    });
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <Avatar name={name} src={preview} size={size} />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 disabled:opacity-0"
            title="Trocar foto"
            aria-label="Trocar foto"
          >
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          </button>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-sm font-medium">{label}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
              disabled={pending}
            >
              <Camera className="h-4 w-4" />
              {preview ? "Trocar foto" : "Enviar foto"}
            </Button>
            {showRemove && preview && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={remove}
                disabled={pending}
                className="text-danger hover:bg-danger/5"
              >
                <X className="h-4 w-4" />
                Remover
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            PNG, JPG, WebP ou GIF até 512 KB. Quadrado fica melhor.
          </p>
          {error && (
            <p role="alert" className="text-xs font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED.join(",")}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
