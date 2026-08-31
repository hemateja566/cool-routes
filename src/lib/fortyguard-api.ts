// FortyGuard API Client with caching, rate limiting, and error handling

import type {
  Coordinates,
  BoundingBox,
  HeatDataPoint,
  EnvironmentalParams,
  StreetSegment,
} from '@/types';

const API_KEY = process.env.NEXT_PUBLIC_FORTYGUARD_API_KEY;
const BASE_URL = process.env.NEXT_PUBLIC_FORTYGUARD_BASE_URL || 'https://api.fortyguard.com/v1';

// FortyGuard Temperature API uses 'api-key' header (not Bearer)
const API_HEADERS = {
  'api-key': API_KEY || '',
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

// In-memory cache with TTL
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Rate limiting
const requestQueue: Array<() => Promise<unknown>> = [];
let isProcessing = false;
const RATE_LIMIT_MS = 100; // 10 requests/second max

function getCacheKey(endpoint: string, params: Record<string, string>): string {
  const sortedParams = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  return `${endpoint}?${sortedParams}`;
}

function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache<T>(key: string, data: T, ttl = CACHE_TTL): void {
  cache.set(key, { data, timestamp: Date.now(), ttl });
}

async function rateLimitedFetch<T>(fetchFn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    requestQueue.push(async () => {
      try {
        const result = await fetchFn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
    processQueue();
  });
}

async function processQueue(): Promise<void> {
  if (isProcessing || requestQueue.length === 0) return;
  isProcessing = true;
  
  while (requestQueue.length > 0) {
    const fn = requestQueue.shift()!;
    await fn();
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
  }
  
  isProcessing = false;
}

async function apiRequest<T>(
  endpoint: string,
  params: Record<string, string> = {},
  options: RequestInit = {}
): Promise<T> {
  const cacheKey = getCacheKey(endpoint, params);
  const cached = getFromCache<T>(cacheKey);
  if (cached) return cached;

  const url = new URL(`${BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  try {
    const res = await rateLimitedFetch(async () => {
      const res = await fetch(url.toString(), {
        ...options,
        headers: {
          ...API_HEADERS,
          ...options.headers,
        },
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`FortyGuard API error (${res.status}): ${txt}`);
      }
      return res.json();
    });

    setCache(cacheKey, res);
    return res;
  } catch (e: any) {
    console.warn('apiRequest caught:', e?.message || e);
    throw e;
  }
}

// Heatmap Generation
export async function getHeatmap(
  bounds: BoundingBox,
  timestamp?: string,
  resolution = 2 // meters
): Promise<HeatDataPoint[]> {
  try {
    const payload = {
      polygon_aoi: {
        type: 'Polygon',
        coordinates: [[
          [bounds.minLng, bounds.minLat],
          [bounds.maxLng, bounds.minLat],
          [bounds.maxLng, bounds.maxLat],
          [bounds.minLng, bounds.maxLat],
          [bounds.minLng, bounds.minLat],
        ]],
      },
      date_time: {
        start_date: timestamp ? timestamp.split('T')[0] : new Date().toISOString().split('T')[0],
        start_time: '14:00',
        filter_type: 1,
      },
    };

    const postRes = await fetch(`${BASE_URL}/heatmap`, {
      method: 'POST',
      headers: API_HEADERS,
      body: JSON.stringify(payload),
    });

    const postData = await postRes.json();
    const actId = postData?.data?.activity_id;
    if (!actId) return [];

    // Poll for status
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const statusRes = await fetch(`${BASE_URL}/status/${actId}`, {
        headers: API_HEADERS,
      });
      const statusJson = await statusRes.json();
      const status = statusJson?.data?.status;

      if (status === 'Completed') {
        const features = statusJson?.data?.result?.map_data?.features || [];
        return features.map((f: any) => ({
          lat: f.geometry?.coordinates?.[0]?.[0]?.[1] || bounds.minLat,
          lng: f.geometry?.coordinates?.[0]?.[0]?.[0] || bounds.minLng,
          temperature: f.properties?.average_temperature || 32,
          timestamp: new Date().toISOString(),
        }));
      }
      if (status === 'Error') break;
    }
    return [];
  } catch (e) {
    console.error('getHeatmap error:', e);
    return [];
  }
}

// Heatmap Forecast (12-hour)
export async function getHeatmapForecast(
  bounds: BoundingBox,
  hours = 12,
  intervalHours = 1
): Promise<HeatDataPoint[][]> {
  // Returns array of heatmaps for each forecast hour
  return apiRequest<HeatDataPoint[][]>('/heatmap/forecast', {
    min_lat: bounds.minLat.toString(),
    min_lng: bounds.minLng.toString(),
    max_lat: bounds.maxLat.toString(),
    max_lng: bounds.maxLng.toString(),
    hours: hours.toString(),
    interval: intervalHours.toString(),
  });
}

// Environmental Parameters at point
export async function getEnvironmentalParams(
  coords: Coordinates,
  timestamp?: string
): Promise<EnvironmentalParams> {
  return apiRequest<EnvironmentalParams>('/environment', {
    lat: coords.lat.toString(),
    lng: coords.lng.toString(),
    ...(timestamp && { timestamp }),
  });
}

// Environmental Params along polyline (for route evaluation)
export async function getEnvironmentalParamsAlongRoute(
  coordinates: Coordinates[],
  timestamp?: string
): Promise<EnvironmentalParams[]> {
  return apiRequest<EnvironmentalParams[]>('/environment/route', {
    coords: coordinates.map(c => `${c.lat},${c.lng}`).join(';'),
    ...(timestamp && { timestamp }),
  });
}

// Map Statistics for polygon
export async function getMapStatistics(
  polygon: Coordinates[],
  params: string[] = ['temperature', 'humidity', 'solar_radiation']
): Promise<Record<string, { min: number; max: number; mean: number; median: number }>> {
  return apiRequest('/statistics', {
    polygon: polygon.map(c => `${c.lat},${c.lng}`).join(';'),
    params: params.join(','),
  });
}

// Satellite Segmentation (land cover, tree canopy, etc.)
export async function getSatelliteSegmentation(
  bounds: BoundingBox,
  classes: string[] = ['tree_canopy', 'impervious', 'water', 'grass', 'building']
): Promise<StreetSegment[]> {
  return apiRequest<StreetSegment[]>('/segmentation/satellite', {
    min_lat: bounds.minLat.toString(),
    min_lng: bounds.minLng.toString(),
    max_lat: bounds.maxLat.toString(),
    max_lng: bounds.maxLng.toString(),
    classes: classes.join(','),
  });
}

// Street View Segmentation (street-level features)
export async function getStreetViewSegmentation(
  bounds: BoundingBox
): Promise<StreetSegment[]> {
  return apiRequest<StreetSegment[]>('/segmentation/streetview', {
    min_lat: bounds.minLat.toString(),
    min_lng: bounds.minLng.toString(),
    max_lat: bounds.maxLat.toString(),
    max_lng: bounds.maxLng.toString(),
  });
}

// Heat Intelligence (risk scores, trends)
export async function getHeatIntelligence(
  bounds: BoundingBox,
  timestamp?: string
): Promise<{ riskScore: number; trend: 'rising' | 'falling' | 'stable'; hotspots: Coordinates[] }> {
  return apiRequest('/intelligence/heat', {
    min_lat: bounds.minLat.toString(),
    min_lng: bounds.minLng.toString(),
    max_lat: bounds.maxLat.toString(),
    max_lng: bounds.maxLng.toString(),
    ...(timestamp && { timestamp }),
  });
}

// Health check
export async function checkApiHealth(): Promise<{ status: string; creditsRemaining: number }> {
  return apiRequest('/health', {}, { method: 'GET' });
}

// Clear cache (useful for development)
export function clearCache(): void {
  cache.clear();
}

// Get cache stats
export function getCacheStats(): { size: number; keys: string[] } {
  return { size: cache.size, keys: Array.from(cache.keys()) };
}