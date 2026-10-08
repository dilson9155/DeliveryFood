import { prisma } from "@/lib/prisma";
import type { DeliverySettings } from "@prisma/client";
import {
  geocodeAddress,
  calculateDeliveryFee,
  estimateMinutes,
  distanceKm as haversineKm,
  getRoadRoute,
  type AddressInput,
  type LatLng,
} from "@/lib/geo";

/** Settings padrão caso ainda não exista linha na tabela */
export const DEFAULT_DELIVERY_SETTINGS: Omit<DeliverySettings, "updatedAt"> = {
  id: "default",
  deliveryEnabled: true,
  baseFee: 5.0,
  feePerKm: 1.5,
  minFee: 5.0,
  maxFee: 30.0,
  maxDistanceKm: 15.0,
  avgSpeedKmh: 25.0,
};

export async function getDeliverySettings(): Promise<DeliverySettings> {
  const row = await prisma.deliverySettings.findUnique({
    where: { id: "default" },
  });
  if (row) return row;
  // Cria com defaults se não existir
  return prisma.deliverySettings.create({
    data: DEFAULT_DELIVERY_SETTINGS,
  });
}

/** Lat/Lng da loja (do cadastro) usado como origem das rotas */
export async function getStoreOrigin(): Promise<{ lat: number; lng: number } | null> {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!settings) return null;
  // Por enquanto usamos o endereço da loja p/ geocoding uma vez.
  // Em produção, salvar lat/lng fixo em Settings seria mais eficiente.
  const address: AddressInput = {
    street: settings.address ?? "",
    number: settings.number ?? "0",
    neighborhood: settings.neighborhood ?? "",
    city: settings.city ?? "",
    state: settings.state ?? "",
    zipCode: settings.zipCode ?? "",
  };
  if (!address.street || !address.city) return null;
  const geo = await geocodeAddress(address);
  return geo ? { lat: geo.lat, lng: geo.lng } : null;
}

export type DeliveryQuoteOk = {
  ok: true;
  distanceKm: number;
  fee: number;
  etaMinutes: number;
  dest: { lat: number; lng: number; displayName: string };
  route: LatLng[] | null;       // geometria da rota por ruas (mapa)
  routeDurationMin: number | null;
  settings: DeliverySettings;
};

export type DeliveryQuoteErr = { ok: false; error: string; distanceKm?: number };

export type DeliveryQuote = DeliveryQuoteOk | DeliveryQuoteErr;

/**
 * Monta a cotação para um destino já geocodificado.
 * Distância usa a rota real por ruas (OSRM); se o serviço não responder,
 * cai no Haversine (linha reta).
 */
async function buildQuote(
  settings: DeliverySettings,
  origin: LatLng,
  dest: { lat: number; lng: number; displayName: string }
): Promise<DeliveryQuote> {
  const road = await getRoadRoute(origin, dest);
  const distanceKm = road ? road.distanceKm : haversineKm(origin, dest);
  if (distanceKm > settings.maxDistanceKm) {
    return {
      ok: false as const,
      error: `Endereço fora da área de entrega (${distanceKm.toFixed(1)} km, máximo ${settings.maxDistanceKm} km).`,
      distanceKm,
    };
  }
  const fee = calculateDeliveryFee({
    distanceKm,
    baseFee: settings.baseFee,
    feePerKm: settings.feePerKm,
    minFee: settings.minFee,
    maxFee: settings.maxFee,
  });
  // ETA pela velocidade média configurada, agora sobre a distância real da rota
  const etaMinutes = estimateMinutes(distanceKm, settings.avgSpeedKmh);
  return {
    ok: true as const,
    distanceKm,
    fee,
    etaMinutes,
    dest,
    route: road?.geometry ?? null,
    routeDurationMin: road?.durationMin ?? null,
    settings,
  };
}

/** Cotação de entrega: geocoding + rota por ruas + taxa */
export async function quoteDelivery(
  customerAddress: AddressInput,
  originOverride?: LatLng
): Promise<DeliveryQuote> {
  const [settings, originFromDb] = await Promise.all([
    getDeliverySettings(),
    originOverride ? null : getStoreOrigin(),
  ]);
  const originCoords = originOverride ?? originFromDb;
  if (!originCoords) {
    return { ok: false as const, error: "Não foi possível localizar a loja." };
  }
  if (!settings.deliveryEnabled) {
    return { ok: false as const, error: "Entrega desabilitada no momento." };
  }

  const dest = await geocodeAddress(customerAddress);
  if (!dest) {
    return {
      ok: false as const,
      error: "Endereço não encontrado. Confira os dados e tente novamente.",
    };
  }
  return buildQuote(settings, originCoords, {
    lat: dest.lat,
    lng: dest.lng,
    displayName: dest.displayName,
  });
}

/**
 * Cota a entrega direto de coordenadas já conhecidas (sem re-geocoding).
 * Usada na criação do pedido para recalcular a taxa no servidor.
 */
export async function quoteDeliveryFromCoords(
  destLat: number,
  destLng: number,
  originOverride?: LatLng
): Promise<DeliveryQuote> {
  const [settings, originFromDb] = await Promise.all([
    getDeliverySettings(),
    originOverride ? null : getStoreOrigin(),
  ]);
  const originCoords = originOverride ?? originFromDb;
  if (!originCoords) {
    return { ok: false as const, error: "Não foi possível localizar a loja." };
  }
  if (!settings.deliveryEnabled) {
    return { ok: false as const, error: "Entrega desabilitada no momento." };
  }
  return buildQuote(settings, originCoords, {
    lat: destLat,
    lng: destLng,
    displayName: "",
  });
}