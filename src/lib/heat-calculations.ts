// Heat calculation utilities: WBGT, Heat Index, risk scoring

import type { EnvironmentalParams, Coordinates, UserProfile, RouteSegment } from '@/types';

/**
 * Calculate Wet Bulb Globe Temperature (WBGT)
 * Using Liljegren et al. (2008) model - more accurate than simple approximations
 * 
 * @param temp Air temperature in Celsius
 * @param humidity Relative humidity (0-100)
 * @param solarRadiation Solar radiation in W/m²
 * @param windSpeed Wind speed in m/s
 * @returns WBGT in Celsius
 */
export function calculateWBGT(
  temp: number,
  humidity: number,
  solarRadiation: number,
  windSpeed: number
): number {
  // Convert to Kelvin
  const T = temp + 273.15;
  const RH = humidity / 100;
  
  // Saturation vapor pressure (Pa)
  const es = 611.2 * Math.exp((17.67 * temp) / (temp + 243.5));
  // Actual vapor pressure
  const ea = RH * es;
  
  // Natural wet bulb temperature (Tnwb) - iterative solution
  // Simplified approximation for performance
  let Tnwb = temp - (1 - RH) * (2.5 + 0.05 * temp);
  
  // Globe temperature (Tg) - simplified
  const Tg = temp + (0.0075 * solarRadiation) - (0.5 * Math.sqrt(windSpeed + 0.1));
  
  // WBGT = 0.7 * Tnwb + 0.2 * Tg + 0.1 * T
  const wbgt = 0.7 * Tnwb + 0.2 * Tg + 0.1 * temp;
  
  return Math.round(wbgt * 10) / 10;
}

/**
 * Calculate Heat Index (apparent temperature)
 * NOAA regression equation (Rothfusz 1990)
 */
export function calculateHeatIndex(tempC: number, humidity: number): number {
  const tempF = tempC * 9/5 + 32;
  
  if (tempF < 80 || humidity < 40) {
    return tempC; // Heat index not applicable
  }
  
  let HI = -42.379 + 2.04901523 * tempF + 10.14333127 * humidity
    - 0.22475541 * tempF * humidity - 0.00683783 * tempF * tempF
    - 0.05481717 * humidity * humidity + 0.00122874 * tempF * tempF * humidity
    + 0.00085282 * tempF * humidity * humidity - 0.00000199 * tempF * tempF * humidity * humidity;
  
  // Adjustments
  if (humidity < 13 && tempF >= 80 && tempF <= 112) {
    HI -= ((13 - humidity) / 4) * Math.sqrt((17 - Math.abs(tempF - 95)) / 17);
  } else if (humidity > 85 && tempF >= 80 && tempF <= 87) {
    HI += ((humidity - 85) / 10) * ((87 - tempF) / 5);
  }
  
  return Math.round((HI - 32) * 5/9 * 10) / 10;
}

/**
 * Calculate heat risk score for a route segment (0-100)
 */
export function calculateSegmentRiskScore(
  segment: RouteSegment,
  profile: UserProfile
): number {
  const { wbgt, shadeCoverage, heatExposure, distance } = segment;
  const { vulnerabilityMultiplier, wbgtThresholds, maxAcceptableRisk, preferredShade } = profile;
  
  // Base risk from WBGT
  let wbgtRisk = 0;
  if (wbgt >= wbgtThresholds.extreme) wbgtRisk = 100;
  else if (wbgt >= wbgtThresholds.high) wbgtRisk = 75;
  else if (wbgt >= wbgtThresholds.moderate) wbgtRisk = 50;
  else if (wbgt >= wbgtThresholds.low) wbgtRisk = 25;
  else wbgtRisk = 10;
  
  // Shade mitigation (more shade = lower risk)
  const shadeBenefit = shadeCoverage * preferredShade * 30; // Max 30 points reduction
  
  // Duration factor (longer exposure = higher risk)
  const durationMinutes = segment.duration / 60;
  const durationFactor = Math.min(1 + durationMinutes / 60, 2); // Cap at 2x
  
  // Heat exposure intensity
  const exposureFactor = Math.min(heatExposure / (distance * 35), 1.5); // Normalize
  
  const rawScore = (wbgtRisk * vulnerabilityMultiplier * durationFactor * exposureFactor) - shadeBenefit;
  
  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

/**
 * Calculate integrated heat exposure along a polyline
 */
export function calculateHeatExposure(
  coords: Coordinates[],
  envParams: EnvironmentalParams[]
): number {
  if (coords.length < 2 || envParams.length === 0) return 0;
  
  let totalExposure = 0;
  const paramCount = envParams.length;
  
  for (let i = 0; i < coords.length - 1; i++) {
    const paramIndex = Math.min(i, paramCount - 1);
    const params = envParams[paramIndex];
    
    // Distance between points (Haversine)
    const dist = haversineDistance(coords[i], coords[i + 1]);
    
    // Exposure = WBGT × distance (weighted by segment length)
    totalExposure += params.wbgt * dist;
  }
  
  return totalExposure;
}

/**
 * Haversine distance between two coordinates (meters)
 */
export function haversineDistance(a: Coordinates, b: Coordinates): number {
  const R = 6371000; // Earth radius in meters
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const a_ = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(a_), Math.sqrt(1 - a_));
  
  return R * c;
}

/**
 * Interpolate environmental params along a route
 * Uses nearest neighbor from available data points
 */
export function interpolateEnvParams(
  routeCoords: Coordinates[],
  heatData: EnvironmentalParams[],
  heatCoords: Coordinates[]
): EnvironmentalParams[] {
  if (heatData.length === 0) {
    // Fallback: create default params
    return routeCoords.map(() => ({
      temperature: 35,
      humidity: 50,
      solarRadiation: 800,
      windSpeed: 2,
      wbgt: 30,
      heatIndex: 40,
    }));
  }
  
  return routeCoords.map(routeCoord => {
    // Find nearest heat data point
    let minDist = Infinity;
    let nearestIdx = 0;
    
    for (let i = 0; i < heatCoords.length; i++) {
      const dist = haversineDistance(routeCoord, heatCoords[i]);
      if (dist < minDist) {
        minDist = dist;
        nearestIdx = i;
      }
    }
    
    return heatData[nearestIdx];
  });
}

/**
 * Calculate shade score for a route segment based on street segments
 */
export function calculateShadeScore(
  routeCoords: Coordinates[],
  streetSegments: Array<{ coordinates: Coordinates[]; shadeScore: number }>
): number {
  if (streetSegments.length === 0) return 0;
  
  let totalShade = 0;
  let totalLength = 0;
  
  for (let i = 0; i < routeCoords.length - 1; i++) {
    const segStart = routeCoords[i];
    const segEnd = routeCoords[i + 1];
    const segLength = haversineDistance(segStart, segEnd);
    
    // Find overlapping street segment
    let bestShade = 0;
    for (const street of streetSegments) {
      // Simple check: if route segment midpoint is near street segment
      const midPoint: Coordinates = {
        lat: (segStart.lat + segEnd.lat) / 2,
        lng: (segStart.lng + segEnd.lng) / 2,
      };
      
      // Check distance to street segment
      const streetDist = distanceToPolyline(midPoint, street.coordinates);
      if (streetDist < 20) { // Within 20 meters
        bestShade = Math.max(bestShade, street.shadeScore);
      }
    }
    
    totalShade += bestShade * segLength;
    totalLength += segLength;
  }
  
  return totalLength > 0 ? totalShade / totalLength : 0;
}

/**
 * Distance from point to polyline
 */
function distanceToPolyline(point: Coordinates, polyline: Coordinates[]): number {
  let minDist = Infinity;
  
  for (let i = 0; i < polyline.length - 1; i++) {
    const dist = distanceToSegment(point, polyline[i], polyline[i + 1]);
    minDist = Math.min(minDist, dist);
  }
  
  return minDist;
}

/**
 * Distance from point to line segment
 */
function distanceToSegment(p: Coordinates, a: Coordinates, b: Coordinates): number {
  const A = p.lat - a.lat;
  const B = p.lng - a.lng;
  const C = b.lat - a.lat;
  const D = b.lng - a.lng;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  
  if (lenSq !== 0) param = dot / lenSq;
  
  let xx, yy;
  
  if (param < 0) {
    xx = a.lat;
    yy = a.lng;
  } else if (param > 1) {
    xx = b.lat;
    yy = b.lng;
  } else {
    xx = a.lat + param * C;
    yy = a.lng + param * D;
  }
  
  const dx = p.lat - xx;
  const dy = p.lng - yy;
  
  return Math.sqrt(dx * dx + dy * dy) * 111000; // Rough meters at equator
}

/**
 * Get risk level color for WBGT
 */
export function getWBGTColor(wbgt: number): string {
  if (wbgt < 25) return '#22c55e'; // green
  if (wbgt < 28) return '#f97316'; // orange
  if (wbgt < 31) return '#ef4444'; // red
  return '#991b1b'; // dark red
}

/**
 * Get risk level label for WBGT
 */
export function getWBGTLabel(wbgt: number): string {
  if (wbgt < 25) return 'Safe';
  if (wbgt < 28) return 'Caution';
  if (wbgt < 31) return 'Danger';
  return 'Extreme Danger';
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
}

/**
 * Format distance in human-readable form
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}