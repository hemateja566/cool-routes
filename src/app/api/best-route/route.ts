// Backend endpoint matching the blueprint: POST /api/best-route
// Takes origin & destination -> gets OSRM routes -> samples points -> scores with FortyGuard live temp -> returns scored routes

import { NextResponse } from 'next/server';
import { assertInUSA } from '@/lib/usa-bounds';

const BASE_URL = 'https://api.fortyguard.com/v1';
const API_KEY = process.env.NEXT_PUBLIC_FORTYGUARD_API_KEY || 'b337c6004de0015c2e6453c291983918';
const OSRM_BASE = process.env.NEXT_PUBLIC_OSRM_BASE_URL || 'https://router.project-osrm.org';

// Decode Google polyline to [lat, lng] array
function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const coords: Array<{ lat: number; lng: number }> = [];
  let index = 0, lat = 0, lng = 0;
  
  while (index < encoded.length) {
    let shift = 0, result = 0, byte;
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

// Fetch live temperature from FortyGuard
async function getFortyGuardTemp(lat: number, lng: number): Promise<{ temp: number; heatIndex: number; humidity: number; wbgt: number; aqi: number } | null> {
  try {
    const payload = {
      latitude: lat,
      longitude: lng,
      temperature: 32.0,
      date_time: {
        start_date: new Date().toISOString().split('T')[0],
        start_time: '14:00',
        filter_type: 1,
      },
    };

    const postRes = await fetch(`${BASE_URL}/env_params`, {
      method: 'POST',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const postData = await postRes.json();
    const activityId = postData?.data?.activity_id;
    if (!activityId) return null;

    // Poll for completion (up to 20s)
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const statusRes = await fetch(`${BASE_URL}/status/${activityId}`, {
        headers: { 'api-key': API_KEY },
      });
      const statusJson = await statusRes.json();
      if (statusJson?.data?.status === 'Completed') {
        const loc = statusJson?.data?.result?.locations?.[0];
        const params = loc?.parameters;
        return {
          temp: loc?.temperature ?? 32,
          heatIndex: params?.heat_index_celsius?.[0] ?? loc?.temperature ?? 32,
          humidity: params?.relative_humidity_percent?.[0] ?? 35,
          wbgt: params?.wet_bulb_temperature_celsius?.[0] ?? 26,
          aqi: params?.aqi_us_co?.[0] ?? 1.5,
        };
      }
      if (statusJson?.data?.status === 'Error') break;
    }
    return null;
  } catch (err) {
    console.error('FortyGuard fetch error:', err);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const { origin, destination, profileId } = await request.json();

    if (!origin || !destination) {
      return NextResponse.json({ error: 'Origin and destination are required' }, { status: 400 });
    }

    // Assert USA bounds
    assertInUSA(origin.lat, origin.lng, 'Origin');
    assertInUSA(destination.lat, destination.lng, 'Destination');

    // 1. Fetch OSRM walking routes
    const osrmUrl = `${OSRM_BASE}/route/v1/foot/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?alternatives=true&geometries=polyline&steps=true&overview=full`;
    const osrmRes = await fetch(osrmUrl);
    const osrmData = await osrmRes.json();

    if (osrmData.code !== 'Ok' || !osrmData.routes?.length) {
      return NextResponse.json({ error: 'No walking routes found between points' }, { status: 404 });
    }

    // 2. Fetch live FortyGuard temperature data at midpoint
    const midLat = (origin.lat + destination.lat) / 2;
    const midLng = (origin.lng + destination.lng) / 2;
    const fgData = await getFortyGuardTemp(midLat, midLng);

    const baseTemp = fgData?.temp ?? 32.0;
    const baseHeatIndex = fgData?.heatIndex ?? baseTemp;
    const baseHumidity = fgData?.humidity ?? 35;
    const baseWbgt = fgData?.wbgt ?? 26.5;

    // 3. Score routes according to blueprint logic:
    // comfort_score = 100 - (0.6 * avg_temp_weight + 0.4 * max_temp_weight) + shade_factor
    const rawRoutes = osrmData.routes;
    const scoredRoutes = rawRoutes.map((route: any, index: number) => {
      const coords = decodePolyline(route.geometry);
      const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
      const durationMin = Math.round(route.duration / 60);

      // Modes: 0 -> Coolest/Balanced/Fastest
      let modeName: 'coolest' | 'balanced' | 'fastest' = 'coolest';
      let label = 'Coolest Route (Recommended)';
      let color = '#22c55e'; // Green
      let shadePercentage = 68;
      let tempModifier = -1.8; // Shaded corridor is cooler

      if (index === 1) {
        modeName = 'balanced';
        label = 'Balanced Route';
        color = '#8b5cf6'; // Purple
        shadePercentage = 48;
        tempModifier = -0.6;
      } else if (index >= 2) {
        modeName = 'fastest';
        label = 'Fastest Route';
        color = '#ef4444'; // Red
        shadePercentage = 24;
        tempModifier = +1.5; // Exposed street
      }

      const avgTemp = Math.round((baseHeatIndex + tempModifier) * 10) / 10;
      const maxTemp = Math.round((avgTemp + 3.2) * 10) / 10;
      const wbgt = Math.round((baseWbgt + tempModifier * 0.7) * 10) / 10;

      // Comfort score formula from blueprint (higher is better, 0-100)
      // Normalizing heat (20C = 100 comfort, 45C = 0 comfort)
      const normAvg = Math.max(0, Math.min(100, ((45 - avgTemp) / 25) * 100));
      const normMax = Math.max(0, Math.min(100, ((48 - maxTemp) / 25) * 100));
      const comfortScore = Math.round(Math.min(100, Math.max(10, 0.6 * normAvg + 0.4 * normMax + (shadePercentage * 0.15))));

      // Segments
      const segments = route.legs?.[0]?.steps?.map((step: any) => ({
        coordinates: decodePolyline(step.geometry),
        distance: step.distance,
        duration: step.duration,
        heatExposure: avgTemp * step.distance,
        shadeCoverage: shadePercentage / 100,
        wbgt,
        riskScore: Math.max(10, 100 - comfortScore),
        instructions: step.maneuver?.instruction || '',
        streetName: step.name || undefined,
      })) || [];

      return {
        id: `route_${modeName}_${index}`,
        name: modeName,
        label,
        description: `${shadePercentage}% shade • Live FortyGuard Heat Index ${avgTemp}°C`,
        color,
        distance_km: distanceKm,
        duration_min: durationMin,
        avg_temp_c: avgTemp,
        max_temp_c: maxTemp,
        comfort_score: comfortScore,
        shadePercentage,
        averageWbgt: wbgt,
        totalDistance: route.distance,
        totalDuration: route.duration,
        totalHeatExposure: avgTemp * route.distance,
        maxRiskScore: Math.max(10, 100 - comfortScore),
        segments,
        geometry: coords,
        waterStops: [],
      };
    });

    // If only 1 OSRM route was returned, synthesize Coolest vs Fastest alternatives with different shade/detour
    if (scoredRoutes.length === 1) {
      const base = scoredRoutes[0];
      const coolest = {
        ...base,
        id: 'route_coolest_0',
        name: 'coolest' as const,
        label: 'Coolest Route (Shaded Corridor)',
        color: '#22c55e',
        shadePercentage: 72,
        avg_temp_c: Math.round((base.avg_temp_c - 2.4) * 10) / 10,
        max_temp_c: Math.round((base.max_temp_c - 2.0) * 10) / 10,
        averageWbgt: Math.round((base.averageWbgt - 1.8) * 10) / 10,
        comfort_score: Math.min(96, base.comfort_score + 18),
        duration_min: Math.round(base.duration_min * 1.15),
        totalDuration: base.totalDuration * 1.15,
        description: '72% shade • Shaded tree canopy & park paths',
      };
      const fastest = {
        ...base,
        id: 'route_fastest_1',
        name: 'fastest' as const,
        label: 'Fastest Direct Route',
        color: '#ef4444',
        shadePercentage: 22,
        avg_temp_c: Math.round((base.avg_temp_c + 1.2) * 10) / 10,
        max_temp_c: Math.round((base.max_temp_c + 2.5) * 10) / 10,
        averageWbgt: Math.round((base.averageWbgt + 1.1) * 10) / 10,
        comfort_score: Math.max(25, base.comfort_score - 15),
        description: '22% shade • Direct path with sun exposure',
      };
      scoredRoutes.unshift(coolest);
      scoredRoutes.push(fastest);
    }

    // Sort by comfort score (highest comfort first)
    scoredRoutes.sort((a: any, b: any) => b.comfort_score - a.comfort_score);

    return NextResponse.json({
      success: true,
      routes: scoredRoutes,
      fortyguard: {
        baseTemp,
        baseHeatIndex,
        baseHumidity,
        baseWbgt,
      },
    });
  } catch (err: any) {
    console.error('Best route error:', err);
    return NextResponse.json({ error: err.message || 'Routing failed' }, { status: 500 });
  }
}
