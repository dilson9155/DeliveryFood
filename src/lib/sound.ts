"use client";

let audioCtx: AudioContext | null = null;

function ensureAudioContext() {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctx = w.AudioContext || w.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(freq: number, durationMs: number, gain = 0.2, type: OscillatorType = "sine") {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + durationMs / 1000);
}

/** Toque tipo sininho (ding-ding) alto e claro */
export function playBell(volume = 0.95) {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  // Ding 1 (C6)
  playTone(1046.5, 120, volume * 0.5, "triangle");
  setTimeout(() => playTone(1318.5, 160, volume * 0.4, "triangle"), 90);
}

/** Alerta urgente (triplo) para novo pedido */
export function playUrgentBell(volume = 1.0) {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  playTone(880, 90, volume * 0.45, "square");
  setTimeout(() => playTone(1174.7, 90, volume * 0.45, "square"), 95);
  setTimeout(() => playTone(1396.9, 180, volume * 0.5, "square"), 190);
}

/** Vibração (se suportada) */
export function vibrate(pattern: number | number[] = [60, 40, 60, 40, 120]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {}
  }
}

/** Reproduz alerta completo (som + vibração) */
export function playNewOrderAlert() {
  playUrgentBell(1.0);
  vibrate([80, 40, 80, 40, 160]);
}

/** Ativa AudioContext após primeiro gesto do usuário (necessário em mobile/autoplay) */
export function unlockAudio() {
  ensureAudioContext();
}
