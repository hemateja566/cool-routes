// Core domain types for CoolRoutes

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface HeatDataPoint {
  lat: number;
  lng: number;
  temperature: number; // Celsius
  timestamp: string; // ISO 8601
  humidity?: number; // 0-100%
  solarRadiation?: number; // W/m²
  windSpeed?: number; // m/s
}

export interface HeatmapTile {
  x: number;
  y: number;
  z: number;
  data: HeatDataPoint[];
  bounds: BoundingBox;
}

export interface EnvironmentalParams {
  temperature: number;
  humidity: number;
  solarRadiation: number;
  windSpeed: number;
  wbgt: number; // Wet Bulb Globe Temperature
  heatIndex: number;
}

export interface StreetSegment {
  id: string;
  coordinates: Coordinates[]; // Polyline
  shadeScore: number; // 0-1 (tree canopy coverage)
  surfaceType: 'asphalt' | 'concrete' | 'pavers' | 'grass' | 'water' | 'building';
  albedo: number; // 0-1
  width: number; // meters
  name?: string;
  highwayType?: string;
}

export interface RouteSegment {
  coordinates: Coordinates[];
  distance: number; // meters
  duration: number; // seconds
  heatExposure: number; // integrated heat along segment
  shadeCoverage: number; // 0-1
  wbgt: number;
  riskScore: number; // 0-100
  instructions?: string;
  streetName?: string;
}

export interface RouteOption {
  id: string;
  name: 'fastest' | 'coolest' | 'balanced';
  label: string;
  description: string;
  color: string;
  segments: RouteSegment[];
  totalDistance: number;
  totalDuration: number;
  totalHeatExposure: number;
  averageWbgt: number;
  maxRiskScore: number;
  shadePercentage: number;
  waterStops: WaterStop[];
  geometry: Coordinates[]; // Full route polyline
}

export interface WaterStop {
  coordinates: Coordinates;
  name: string;
  type: 'fountain' | 'store' | 'park' | 'public_building';
  distanceFromStart: number; // meters
}

export interface UserProfile {
  id: string;
  name: string;
  icon: string;
  description: string;
  vulnerabilityMultiplier: number; // 1.0 = baseline, higher = more vulnerable
  wbgtThresholds: {
    low: number; // Safe
    moderate: number; // Caution
    high: number; // Danger
    extreme: number; // Extreme danger
  };
  maxAcceptableRisk: number; // 0-100
  preferredShade: number; // 0-1 preference weight
}

export const USER_PROFILES: UserProfile[] = [
  {
    id: 'healthy_adult',
    name: 'Healthy Adult',
    icon: '🏃',
    description: 'Active person, normal heat tolerance',
    vulnerabilityMultiplier: 1.0,
    wbgtThresholds: { low: 25, moderate: 28, high: 31, extreme: 33 },
    maxAcceptableRisk: 70,
    preferredShade: 0.3,
  },
  {
    id: 'elderly',
    name: 'Elderly (65+)',
    icon: '👴',
    description: 'Reduced thermoregulation, higher risk',
    vulnerabilityMultiplier: 1.8,
    wbgtThresholds: { low: 22, moderate: 25, high: 28, extreme: 30 },
    maxAcceptableRisk: 40,
    preferredShade: 0.7,
  },
  {
    id: 'child',
    name: 'Child (Under 12)',
    icon: '👶',
    description: 'Higher metabolic heat, less sweating',
    vulnerabilityMultiplier: 1.5,
    wbgtThresholds: { low: 23, moderate: 26, high: 29, extreme: 31 },
    maxAcceptableRisk: 45,
    preferredShade: 0.6,
  },
  {
    id: 'outdoor_worker',
    name: 'Outdoor Worker',
    icon: '👷',
    description: 'Prolonged exposure, physical exertion',
    vulnerabilityMultiplier: 1.6,
    wbgtThresholds: { low: 24, moderate: 27, high: 30, extreme: 32 },
    maxAcceptableRisk: 50,
    preferredShade: 0.5,
  },
  {
    id: 'pregnant',
    name: 'Pregnant Person',
    icon: '🤰',
    description: 'Increased core temperature, cardiovascular strain',
    vulnerabilityMultiplier: 1.7,
    wbgtThresholds: { low: 22, moderate: 25, high: 28, extreme: 30 },
    maxAcceptableRisk: 35,
    preferredShade: 0.7,
  },
  {
    id: 'medical_condition',
    name: 'Medical Condition',
    icon: '🏥',
    description: 'Heart/respiratory conditions, medications affecting cooling',
    vulnerabilityMultiplier: 2.0,
    wbgtThresholds: { low: 21, moderate: 24, high: 27, extreme: 29 },
    maxAcceptableRisk: 30,
    preferredShade: 0.8,
  },
];

export interface RouteRequest {
  origin: Coordinates;
  destination: Coordinates;
  profileId: string;
  mode: 'fastest' | 'coolest' | 'balanced';
  departureTime?: string; // ISO 8601, default now
  avoidHighHeat?: boolean;
  maxDetourFactor?: number; // 1.0 = no detour, 1.5 = 50% longer allowed
}

export interface RouteResponse {
  routes: RouteOption[];
  request: RouteRequest;
  timestamp: string;
  heatmapBounds: BoundingBox;
  warnings: string[];
}

export interface HeatRiskLevel {
  level: 'safe' | 'caution' | 'danger' | 'extreme';
  label: string;
  color: string;
  description: string;
  wbgtRange: [number, number];
}

export const HEAT_RISK_LEVELS: HeatRiskLevel[] = [
  {
    level: 'safe',
    label: 'Safe',
    color: '#22c55e',
    description: 'Minimal heat risk. Normal activity safe.',
    wbgtRange: [0, 25],
  },
  {
    level: 'caution',
    label: 'Caution',
    color: '#f97316',
    description: 'Moderate risk. Limit exertion, hydrate frequently.',
    wbgtRange: [25, 28],
  },
  {
    level: 'danger',
    label: 'Danger',
    color: '#ef4444',
    description: 'High risk. Avoid exertion, seek shade/cooling.',
    wbgtRange: [28, 31],
  },
  {
    level: 'extreme',
    label: 'Extreme Danger',
    color: '#991b1b',
    description: 'Life-threatening. Stop activity, immediate cooling required.',
    wbgtRange: [31, 50],
  },
];

export function getHeatRiskLevel(wbgt: number): HeatRiskLevel {
  return HEAT_RISK_LEVELS.find(
    (r) => wbgt >= r.wbgtRange[0] && wbgt < r.wbgtRange[1]
  ) || HEAT_RISK_LEVELS[HEAT_RISK_LEVELS.length - 1];
}

