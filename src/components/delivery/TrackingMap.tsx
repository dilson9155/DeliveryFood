"use client";

import { useEffect, useRef } from "react";
import type { LatLng } from "@/lib/geo";

type TrackingMapProps = {
  origin?: LatLng | null;       // loja
  destination?: LatLng | null;  // cliente
  current?: LatLng | null;      // posição atual do motoboy
  routePoints?: LatLng[];       // pontos coletados (histórico curto)
  roadRoute?: LatLng[] | null;  // geometria da rota por ruas (OSRM)
  height?: number | string;
  zoom?: number;
};

// Tipos mínimos do Leaflet (não usamos o pacote npm — carregamos via CDN)
type LMap = unknown;
type LMarker = { remove: () => void; bindPopup: (s: string) => LMarker; addTo: (m: LMap) => LMarker };
type LPolyline = { remove: () => void; addTo: (m: LMap) => LPolyline };
type LLayer = {
  map?: (m: string, opts?: Record<string, unknown>) => LMap;
  setView?: (latlng: [number, number], zoom: number) => LMap;
  fitBounds?: (bounds: [number, number][], opts?: Record<string, unknown>) => void;
  remove?: () => void;
};
type LeafletNS = {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => LMap;
  tileLayer: (url: string, opts?: Record<string, unknown>) => { addTo: (m: LMap) => unknown };
  marker: (pos: [number, number], opts?: { icon?: unknown; title?: string }) => LMarker;
  divIcon: (opts: { html: string; iconSize: [number, number]; iconAnchor: [number, number]; className: string }) => unknown;
  polyline: (points: [number, number][], opts?: Record<string, unknown>) => LPolyline;
  LatLngBounds?: unknown;
};

declare global {
  // eslint-disable-next-line no-var
  var L: LeafletNS | undefined;
}

/**
 * Mapa com Leaflet + OpenStreetMap.
 * Carregamento lazy: importa Leaflet via <link> CSS + dynamic ESM (CDN)
 * somente no client. Sem dependência npm para evitar peso no bundle inicial.
 */
export function TrackingMap({
  origin,
  destination,
  current,
  routePoints = [],
  roadRoute = null,
  height = 360,
  zoom = 16,
  follow = true,
  heading = 0,
}: TrackingMapProps & { follow?: boolean; heading?: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const layersRef = useRef<{
    origin?: { remove: () => void };
    destination?: { remove: () => void };
    current?: { remove: () => void };
    polyline?: { remove: () => void };
    road?: { remove: () => void };
  }>({});

  useEffect(() => {
    let cancelled = false;

    async function loadLeaflet() {
      // CSS
      if (!document.querySelector('link[data-leaflet]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        link.crossOrigin = "";
        link.dataset.leaflet = "true";
        document.head.appendChild(link);
      }
      // JS (lazy)
      if (!globalThis.L) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          script.crossOrigin = "";
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Falha ao carregar Leaflet"));
          document.body.appendChild(script);
        });
      }
      if (cancelled) return;
      const L = (globalThis as { L?: LeafletNS }).L;
      if (!L) return;
      if (mapRef.current) return; // já inicializado

      const container = containerRef.current;
      if (!container) return;

      const map = L.map(container, {
        zoomControl: true,
        attributionControl: true,
      });

      const m = map as unknown as { setView: (latlng: [number, number], zoom: number) => void };
      m.setView(
        [current?.lat ?? origin?.lat ?? destination?.lat ?? -19.9, current?.lng ?? origin?.lng ?? destination?.lng ?? -43.9],
        zoom
      );

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      mapRef.current = map;
      redraw();
    }

    loadLeaflet().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[TrackingMap]", err);
    });

    return () => {
      cancelled = true;
      const m = mapRef.current as { remove?: () => void } | null;
      if (m) {
        m.remove?.();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function redraw() {
    const map = mapRef.current as LMap | null;
    const L = (globalThis as { L?: LeafletNS }).L;
    if (!map || !L) return;
    const { origin: o, destination: d, current: c, routePoints: rp, roadRoute: rd } = {
      origin: originRef.current,
      destination: destinationRef.current,
      current: currentRef.current,
      routePoints: routePointsRef.current,
      roadRoute: roadRouteRef.current,
    };

    // Limpa markers antigos
    Object.values(layersRef.current).forEach((m) => {
      if (m && typeof (m as { remove?: () => void }).remove === "function") {
        (m as { remove: () => void }).remove();
      }
    });
    layersRef.current = {};

    const bounds: [number, number][] = [];

    if (o) {
      const mk = L.marker([o.lat, o.lng], { title: "Loja" });
      mk.addTo(map);
      mk.bindPopup("Loja");
      layersRef.current.origin = { remove: () => mk.remove() };
      bounds.push([o.lat, o.lng]);
    }
    if (d) {
      const destIcon = L.divIcon({
        className: "",
        html: `<div style="font-size:28px;line-height:28px;">📍</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });
      const mk = L.marker([d.lat, d.lng], { icon: destIcon, title: "Cliente" });
      mk.addTo(map);
      mk.bindPopup("Endereço de entrega");
      layersRef.current.destination = { remove: () => mk.remove() };
      bounds.push([d.lat, d.lng]);
    }
    if (c) {
      const rot = typeof heading === "number" && Number.isFinite(heading) ? Math.round(heading) : 0;
      const currentIcon = L.divIcon({
        className: "",
        html: `<div style="font-size:30px;line-height:30px;transform:rotate(${rot}deg);display:inline-block;">🚗</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      const mk = L.marker([c.lat, c.lng], { icon: currentIcon, title: "Motoboy" });
      mk.addTo(map);
      mk.bindPopup("Você está aqui");
      layersRef.current.current = { remove: () => mk.remove() };
      bounds.push([c.lat, c.lng]);
    }
    if (rd && rd.length > 1) {
      const roadLine = L.polyline(
        rd.map((p) => [p.lat, p.lng] as [number, number]),
        { color: "#64748b", weight: 5, opacity: 0.55, dashArray: "1 10", lineCap: "round" }
      );
      roadLine.addTo(map);
      layersRef.current.road = { remove: () => roadLine.remove() };
    }
    if (rp.length > 1) {
      const line = L.polyline(
        rp.map((p) => [p.lat, p.lng] as [number, number]),
        { color: "#0ea5e9", weight: 4, opacity: 0.85 }
      );
      line.addTo(map);
      layersRef.current.polyline = { remove: () => line.remove() };
    }

    const mapApi = map as unknown as {
      fitBounds?: (b: [number, number][], o?: Record<string, unknown>) => void;
      setView?: (latlng: [number, number], zoom: number) => void;
      panTo?: (latlng: [number, number], o?: Record<string, unknown>) => void;
    };
    if (follow && c) {
      try {
        mapApi.panTo?.([c.lat, c.lng], { animate: true });
      } catch {}
    } else if (bounds.length > 1) {
      try {
        mapApi.fitBounds?.(bounds, { padding: [48, 48], maxZoom: 17 });
      } catch {}
    } else if (bounds.length === 1) {
      mapApi.setView?.(bounds[0], 16);
    } else {
      mapApi.setView?.([c?.lat ?? origin?.lat ?? -19.9, c?.lng ?? origin?.lng ?? -43.9], 16);
    }
  }

  // refs para redraw()
  const originRef = useRef(origin);
  const destinationRef = useRef(destination);
  const currentRef = useRef(current);
  const routePointsRef = useRef(routePoints);
  const roadRouteRef = useRef(roadRoute ?? null);
  useEffect(() => { originRef.current = origin; }, [origin]);
  useEffect(() => { destinationRef.current = destination; }, [destination]);
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { routePointsRef.current = routePoints; }, [routePoints]);
  useEffect(() => { roadRouteRef.current = roadRoute ?? null; }, [roadRoute]);

  useEffect(() => {
    if (mapRef.current) redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destination, current, routePoints, roadRoute]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: "100%" }}
      className="overflow-hidden rounded-2xl border border-border"
    />
  );
}