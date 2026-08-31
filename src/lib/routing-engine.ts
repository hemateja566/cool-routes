// Heat-aware routing engine combining OSRM with FortyGuard heat data

import type {
  Coordinates,
  RouteRequest,
  RouteResponse,
  RouteOption,
  RouteSegment,
  UserProfile,
  EnvironmentalParams,
  StreetSegment,
  BoundingBox,
} from '@/types';
import {
  calculateWBGT,
  calculateHeatExposure,
  interpolateEnvParams,
  calculateShadeScore,
  haversineDistance,
  formatDuration,
  formatDistance,
  calculateSegmentRiskScore,
} from '@/lib/heat-calculations';
import { USER_PROFILES } from '@/types';
import {
  getHeatmap,
  getEnvironmentalParamsAlongRoute,
  getSatelliteSegmentation,
  getMapStatistics,
} from '@/lib/fortyguard-api';
import { assertInUSA } from '@/lib/usa-bounds';

const OSRM_BASE = process.env.NEXT_PUBLIC_OSRM_BASE_URL || 'https://router.project-osrm.org';
const RESTRICT_USA = process.env.NEXT_PUBLIC_RESTRICT_TO_USA === 'true';

// OSRM Response types
interface OSRMRoute {
  geometry: string; // Polyline encoded
  distance: number; // meters
  duration: number; // seconds
  legs: Array<{
    steps: Array<{
      geometry: string;
      distance: number;
      duration: number;
      name: string;
      maneuver: { instruction: string; type: string };
    }>;
    summary: string;
  }>;
}

interface OSRMResponse {
  code: string;
  routes: OSRMRoute[];
  waypoints: Array<{ location: [number, number]; name: string }>;
}

// Decode Google polyline
function decodePolyline(encoded: string): Coordinates[] {
  const coords: Coordinates[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;
    
    shift = 0;
    result = 0;
    
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;
    
    coords.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  
  return coords;
}

// Encode coordinates to polyline (for OSRM)
function encodePolyline(coords: Coordinates[]): string {
  let result = '';
  let prevLat = 0;
  let prevLng = 0;
  
  for (const coord of coords) {
    const lat = Math.round(coord.lat * 1e5);
    const lng = Math.round(coord.lng * 1e5);
    
    const dLat = lat - prevLat;
    const dLng = lng - prevLng;
    
    prevLat = lat;
    prevLng = lng;
    
    result += encodeValue(dLat);
    result += encodeValue(dLng);
  }
  
  return result;
}

function encodeValue(value: number): string {
  value = value < 0 ? ~(value << 1) : (value << 1);
  let encoded = '';
  
  while (value >= 0x20) {
    encoded += String.fromCharCode((value & 0x1f) | 0x20 + 63);
    value >>= 5;
  }
  
  encoded += String.fromCharCode(value + 63);
  return encoded;
}

// Get route from OSRM
async function getOSRMRoute(
  origin: Coordinates,
  destination: Coordinates,
  alternatives = true
): Promise<OSRMRoute[]> {
  const url = new URL(`${OSRM_BASE}/route/v1/foot/${origin.lng},${origin.lat};${destination.lng},${destination.lat}`);
  url.searchParams.set('alternatives', alternatives ? 'true' : 'false');
  url.searchParams.set('geometries', 'polyline');
  url.searchParams.set('steps', 'true');
  url.searchParams.set('overview', 'full');
  
  const response = await fetch(url.toString());
  const data: OSRMResponse = await response.json();
  
  if (data.code !== 'Ok' || !data.routes.length) {
    throw new Error(`OSRM routing failed: ${data.code}`);
  }
  
  return data.routes;
}

// Expand route with heat data
async function enrichRouteWithHeatData(
  route: OSRMRoute,
  profile: UserProfile,
  timestamp?: string
): Promise<RouteOption> {
  const coords = decodePolyline(route.geometry);
  
  // Get bounding box for heat data
  const bounds = getBoundsFromCoords(coords);
  
  // Fetch heat and environmental data in parallel, with fallback to mock data if API fails
  let heatData: EnvironmentalParams[] = [];
  let streetSegments: StreetSegment[] = [];
  let shadeScore: number = 0.3;
  
  try {
    const [heatResult, segResult] = await Promise.all([
      getEnvironmentalParamsAlongRoute(coords, timestamp),
      getSatelliteSegmentation(bounds),
    ]);
    if (heatResult) heatData = heatResult;
    if (segResult) streetSegments = segResult;
  } catch (e) {
    console.warn('FortyGuard API failed, using mock heat data:', e);
    // Generate mock heat data along the route
    heatData = coords.map((c, i) => ({
      temperature: 30 + Math.random() * 6,
      humidity: 30 + Math.random() * 30,
      solarRadiation: 400 + Math.random() * 400,
      windSpeed: 0.5 + Math.random() * 2,
      wbgt: 27 + Math.random() * 5,
      heatIndex: 32 + Math.random() * 5,
    }));
    shadeScore = 0.2 + Math.random() * 0.4;
  }
  
  // Calculate shade score (with fallback)
  try {
    shadeScore = calculateShadeScore(coords, streetSegments);
  } catch (e) {
    shadeScore = 0.3;
  }
  
  // Interpolate environmental params along route
  const heatCoords = heatData.map((_, i) => coords[Math.min(i, coords.length - 1)]);
  const envParams = interpolateEnvParams(coords, heatData, heatCoords);
  
  // Build route segments from OSRM steps
  const segments: RouteSegment[] = [];
  let cumulativeDistance = 0;
  
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      const stepCoords = decodePolyline(step.geometry);
      const stepEnvParams = heatData.length > 0 
        ? interpolateEnvParams(stepCoords, heatData, heatCoords)
        : envParams;
      
      // Calculate average WBGT for this step
      const avgWbgt = stepEnvParams.reduce((sum, p) => sum + p.wbgt, 0) / stepEnvParams.length;
      
      // Heat exposure
      const heatExposure = calculateHeatExposure(stepCoords, stepEnvParams);
      
      // Shade for this segment
      const stepShadeScore = shadeScore;
      
      // Create segment
      const segment: RouteSegment = {
        coordinates: stepCoords,
        distance: step.distance,
        duration: step.duration,
        heatExposure,
        shadeCoverage: stepShadeScore,
        wbgt: Math.round(avgWbgt * 10) / 10,
        riskScore: 0,
        instructions: step.maneuver?.instruction,
        streetName: step.name || undefined,
      };
      
      // Calculate risk score
      segment.riskScore = calculateSegmentRiskScore(segment, profile);
      
      segments.push(segment);
      cumulativeDistance += step.distance;
    }
  }
  
  // Calculate totals
  const totalDistance = route.distance;
  const totalDuration = route.duration;
  const totalHeatExposure = segments.reduce((sum, s) => sum + s.heatExposure, 0);
  const averageWbgt = segments.reduce((sum, s) => sum + s.wbgt * s.distance, 0) / totalDistance;
  const maxRiskScore = Math.max(...segments.map(s => s.riskScore));
  const shadePercentage = shadeScore * 100;
  
  // Find water stops along route (simplified)
  const waterStops = findWaterStops(coords);
  
  return {
    id: `route_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: 'balanced' as const,
    label: 'Custom Route',
    description: '',
    color: '#3b82f6',
    segments,
    totalDistance,
    totalDuration,
    totalHeatExposure,
    averageWbgt,
    maxRiskScore,
    shadePercentage,
    waterStops,
    geometry: coords,
  };
}

// Generate alternative routes with different weightings
async function generateRouteAlternatives(
  origin: Coordinates,
  destination: Coordinates,
  profile: UserProfile,
  mode: 'fastest' | 'coolest' | 'balanced',
  timestamp?: string
): Promise<RouteOption[]> {
  // Get base routes from OSRM
  const baseRoutes = await getOSRMRoute(origin, destination, true);
  
  // Enrich each with heat data
  const enrichedRoutes = await Promise.all(
    baseRoutes.map(route => enrichRouteWithHeatData(route, profile, timestamp))
  );
  
  // Score and sort based on mode
  const scoredRoutes = enrichedRoutes.map((route, idx) => ({
    ...route,
    id: `route_${mode}_${idx}`,
    name: mode,
    label: getModeLabel(mode),
    description: getModeDescription(mode),
    color: getModeColor(mode),
    score: calculateRouteScore(route, profile, mode),
  }));
  
  // Sort by score (lower is better for fastest/coolest, balanced is composite)
  scoredRoutes.sort((a, b) => a.score - b.score);
  
  return scoredRoutes.slice(0, 3); // Return top 3
}

function calculateRouteScore(
  route: RouteOption,
  profile: UserProfile,
  mode: 'fastest' | 'coolest' | 'balanced'
): number {
  const { totalDuration, totalHeatExposure, averageWbgt, maxRiskScore, shadePercentage } = route;
  const { vulnerabilityMultiplier, preferredShade } = profile;
  
  // Normalize values (rough approximations)
  const normDuration = totalDuration / 3600; // hours
  const normHeat = totalHeatExposure / 100000; // normalized
  const normRisk = maxRiskScore / 100;
  const normShade = shadePercentage / 100;
  
  switch (mode) {
    case 'fastest':
      return normDuration * 1.0 + normHeat * 0.3 + normRisk * 0.2;
      
    case 'coolest':
      return normHeat * 1.0 + normRisk * 1.5 + (1 - normShade) * 0.5 + normDuration * 0.2;
      
    case 'balanced':
    default:
      return (
        normDuration * 0.4 +
        normHeat * 0.4 +
        normRisk * 0.3 +
        (1 - normShade) * 0.3 * preferredShade
      );
  }
}

function getModeLabel(mode: 'fastest' | 'coolest' | 'balanced'): string {
  switch (mode) {
    case 'fastest': return 'Fastest';
    case 'coolest': return 'Coolest';
    case 'balanced': return 'Balanced';
  }
}

function getModeDescription(mode: 'fastest' | 'coolest' | 'balanced'): string {
  switch (mode) {
    case 'fastest': return 'Shortest time, may pass through hot areas';
    case 'coolest': return 'Minimizes heat exposure, may take longer';
    case 'balanced': return 'Optimizes both time and heat safety';
  }
}

function getModeColor(mode: 'fastest' | 'coolest' | 'balanced'): string {
  switch (mode) {
    case 'fastest': return '#3b82f6'; // blue
    case 'coolest': return '#14b8a6'; // teal
    case 'balanced': return '#8b5cf6'; // purple
  }
}

function getBoundsFromCoords(coords: Coordinates[]): BoundingBox {
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  
  for (const coord of coords) {
    minLat = Math.min(minLat, coord.lat);
    minLng = Math.min(minLng, coord.lng);
    maxLat = Math.max(maxLat, coord.lat);
    maxLng = Math.max(maxLng, coord.lng);
  }
  
  // Add padding (approx 200m)
  const padding = 0.002;
  return {
    minLat: minLat - padding,
    minLng: minLng - padding,
    maxLat: maxLat + padding,
    maxLng: maxLng + padding,
  };
}

// Simplified water stop finder (in production, use Overpass API or similar)
function findWaterStops(routeCoords: Coordinates[]): Array<{
  coordinates: Coordinates;
  name: string;
  type: 'fountain' | 'store' | 'park' | 'public_building';
  distanceFromStart: number;
}> {
  const stops = [];
  let cumulativeDist = 0;
  
  // Check every ~500m along route
  for (let i = 0; i < routeCoords.length - 1; i++) {
    const segDist = haversineDistance(routeCoords[i], routeCoords[i + 1]);
    cumulativeDist += segDist;
    
    if (cumulativeDist >= 500 && Math.random() < 0.3) { // 30% chance every 500m
      const types: Array<'fountain' | 'store' | 'park' | 'public_building'> = 
        ['fountain', 'store', 'park', 'public_building'];
      stops.push({
        coordinates: routeCoords[i],
        name: `${types[Math.floor(Math.random() * types.length)]} ${stops.length + 1}`,
        type: types[Math.floor(Math.random() * types.length)],
        distanceFromStart: cumulativeDist,
      });
      cumulativeDist = 0;
    }
  }
  
  return stops;
}

// Main routing function
export async function calculateHeatAwareRoutes(
  request: RouteRequest
): Promise<RouteResponse> {
  if (RESTRICT_USA) {
    assertInUSA(request.origin.lat, request.origin.lng, 'Origin');
    assertInUSA(request.destination.lat, request.destination.lng, 'Destination');
  }
  const profile = USER_PROFILES.find(p => p.id === request.profileId) || USER_PROFILES[0];
  const timestamp = request.departureTime || new Date().toISOString();
  const warnings: string[] = [];
  
  try {
    // Get routes for requested mode
    const routes = await generateRouteAlternatives(
      request.origin,
      request.destination,
      profile,
      request.mode,
      timestamp
    );
    
    // If avoidHighHeat, filter out dangerous routes
    let filteredRoutes = routes;
    if (request.avoidHighHeat) {
      filteredRoutes = routes.filter(r => r.maxRiskScore < profile.maxAcceptableRisk);
      if (filteredRoutes.length === 0) {
        warnings.push('All routes exceed heat risk threshold. Showing least dangerous options.');
        filteredRoutes = routes.slice(0, 1);
      }
    }
    
    // Apply max detour factor
    if (request.maxDetourFactor && request.maxDetourFactor > 1) {
      const fastestRoute = routes.find(r => r.name === 'fastest') || routes[0];
      const maxDistance = fastestRoute.totalDistance * request.maxDetourFactor;
      filteredRoutes = filteredRoutes.filter(r => r.totalDistance <= maxDistance);
    }
    
    // Ensure we have at least one route
    if (filteredRoutes.length === 0) {
      filteredRoutes = routes.slice(0, 1);
    }
    
    return {
      routes: filteredRoutes,
      request,
      timestamp: new Date().toISOString(),
      heatmapBounds: getBoundsFromCoords(
        filteredRoutes.flatMap(r => r.geometry)
      ),
      warnings,
    };
  } catch (error) {
    console.error('Routing error:', error);
    throw new Error(`Failed to calculate routes: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Demo mode - returns mock data for hackathon presentation
export async function calculateDemoRoutes(
  request: RouteRequest
): Promise<RouteResponse> {
  if (RESTRICT_USA) {
    assertInUSA(request.origin.lat, request.origin.lng, 'Origin');
    assertInUSA(request.destination.lat, request.destination.lng, 'Destination');
  }
  // Simulate network delay
  await new Promise(r => setTimeout(r, 800));
  
  const profile = USER_PROFILES.find(p => p.id === request.profileId) || USER_PROFILES[0];
  
  // Generate mock routes with realistic variations
  const baseDistance = haversineDistance(request.origin, request.destination);
  const baseDuration = baseDistance / 1.4; // ~5 km/h walking
  
  const modes: Array<'fastest' | 'coolest' | 'balanced'> = ['fastest', 'coolest', 'balanced'];
  const routes: RouteOption[] = modes.map((mode, idx) => {
    const distanceMultiplier = mode === 'fastest' ? 1.0 : mode === 'coolest' ? 1.35 : 1.15;
    const heatMultiplier = mode === 'coolest' ? 0.55 : mode === 'balanced' ? 0.75 : 1.0;
    const shadeMultiplier = mode === 'coolest' ? 1.8 : mode === 'balanced' ? 1.4 : 0.8;
    
    const distance = baseDistance * distanceMultiplier;
    const duration = baseDuration * distanceMultiplier;
    
    // Create mock segments
    const segmentCount = Math.max(3, Math.floor(distance / 200));
    const segments: RouteSegment[] = [];
    
    for (let i = 0; i < segmentCount; i++) {
      const segDistance = distance / segmentCount;
      const segDuration = duration / segmentCount;
      
      // Vary heat by mode
      const baseWbgt = 28 + Math.random() * 6; // 28-34°C
      const wbgt = baseWbgt * heatMultiplier + (Math.random() - 0.5) * 2;
      const shade = Math.min(0.9, 0.2 + Math.random() * 0.5 * shadeMultiplier);
      
      const segment: RouteSegment = {
        coordinates: [
          { 
            lat: request.origin.lat + (request.destination.lat - request.origin.lat) * (i / segmentCount),
            lng: request.origin.lng + (request.destination.lng - request.origin.lng) * (i / segmentCount),
          },
          { 
            lat: request.origin.lat + (request.destination.lat - request.origin.lat) * ((i + 1) / segmentCount),
            lng: request.origin.lng + (request.destination.lng - request.origin.lng) * ((i + 1) / segmentCount),
          },
        ],
        distance: segDistance,
        duration: segDuration,
        heatExposure: wbgt * segDistance,
        shadeCoverage: shade,
        wbgt: Math.round(wbgt * 10) / 10,
        riskScore: 0,
        instructions: i === 0 ? 'Head toward destination' : 'Continue straight',
        streetName: `Street ${i + 1}`,
      };
      
      segment.riskScore = calculateSegmentRiskScore(segment, profile);
      segments.push(segment);
    }
    
    const totalHeatExposure = segments.reduce((sum, s) => sum + s.heatExposure, 0);
    const averageWbgt = segments.reduce((sum, s) => sum + s.wbgt * s.distance, 0) / distance;
    const maxRiskScore = Math.max(...segments.map(s => s.riskScore));
    const shadePercentage = segments.reduce((sum, s) => sum + s.shadeCoverage * s.distance, 0) / distance * 100;
    
    return {
      id: `demo_${mode}_${Date.now()}`,
      name: mode,
      label: getModeLabel(mode),
      description: getModeDescription(mode),
      color: getModeColor(mode),
      segments,
      totalDistance: distance,
      totalDuration: duration,
      totalHeatExposure,
      averageWbgt: Math.round(averageWbgt * 10) / 10,
      maxRiskScore,
      shadePercentage: Math.round(shadePercentage),
      waterStops: [
        {
          coordinates: {
            lat: (request.origin.lat + request.destination.lat) / 2,
            lng: (request.origin.lng + request.destination.lng) / 2,
          },
          name: 'Water Fountain',
          type: 'fountain',
          distanceFromStart: distance / 2,
        },
      ],
      geometry: segments.flatMap(s => s.coordinates),
    };
  });
  
  return {
    routes,
    request,
    timestamp: new Date().toISOString(),
    heatmapBounds: getBoundsFromCoords(
      routes.flatMap(r => r.geometry)
    ),
    warnings: ['Demo mode: using simulated heat data'],
  };
}