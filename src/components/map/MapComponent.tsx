// MapLibre GL Map Component with heatmap and route layers

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Coordinates, RouteOption, BoundingBox } from '@/types';
import { getHeatmap } from '@/lib/fortyguard-api';
import { USA_BOUNDS } from '@/lib/usa-bounds';
import { clsx } from 'clsx';

interface MapComponentProps {
  center: Coordinates;
  zoom: number;
  onCenterChange: (center: Coordinates) => void;
  onZoomChange: (zoom: number) => void;
  routes: RouteOption[];
  selectedRoute: RouteOption | null;
  origin: Coordinates | null;
  destination: Coordinates | null;
  showHeatmap: boolean;
  heatmapOpacity: number;
  heatmapBounds: BoundingBox | null;
  onMapClick: (coords: Coordinates) => void;
  className?: string;
}

export function MapComponent({
  center,
  zoom,
  onCenterChange,
  onZoomChange,
  routes,
  selectedRoute,
  origin,
  destination,
  showHeatmap,
  heatmapOpacity,
  heatmapBounds,
  onMapClick,
  className,
}: MapComponentProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const heatmapSourceAdded = useRef(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [heatmapData, setHeatmapData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [isLoadingHeatmap, setIsLoadingHeatmap] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

  // Initialize map
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    const mapStyle = process.env.NEXT_PUBLIC_MAP_STYLE_URL || 
      'https://tiles.openfreemap.org/styles/liberty';
    
    let newMap: maplibregl.Map;
    try {
      newMap = new maplibregl.Map({
        container: mapContainer.current,
        style: mapStyle,
        center: [center.lng, center.lat],
        zoom,
        pitch: 0,
        bearing: 0,
        antialias: true,
        preserveDrawingBuffer: true,
        maxBounds: [[USA_BOUNDS.minLng, USA_BOUNDS.minLat], [USA_BOUNDS.maxLng, USA_BOUNDS.maxLat]],
        renderWorldCopies: false,
      });
    } catch (err) {
      setMapError('Failed to initialize map');
      return;
    }

    newMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    newMap.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    } as any), 'top-right');

    newMap.on('load', () => {
      setMapLoaded(true);
      initMapSources(newMap);
    });

    newMap.on('moveend', () => {
      const mapCenter = newMap.getCenter();
      const mapZoom = newMap.getZoom();
      onCenterChange({ lat: mapCenter.lat, lng: mapCenter.lng });
      onZoomChange(mapZoom);
    });

    newMap.on('click', (e) => {
      onMapClickRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    map.current = newMap;

    return () => {
      newMap.remove();
      map.current = null;
      heatmapSourceAdded.current = false;
    };
  }, []);

  // Initialize map sources and layers
  const initMapSources = useCallback((mapInstance: maplibregl.Map) => {
    // Heatmap source (initially empty)
    if (!mapInstance.getSource('heatmap')) {
      mapInstance.addSource('heatmap', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }

    // Heatmap layer
    if (!mapInstance.getLayer('heatmap-layer')) {
      mapInstance.addLayer({
        id: 'heatmap-layer',
        type: 'heatmap',
        source: 'heatmap',
        maxzoom: 16,
        paint: {
          'heatmap-weight': [
            'interpolate',
            ['linear'],
            ['get', 'temperature'],
            20, 0,
            35, 0.6,
            45, 1,
          ],
          'heatmap-intensity': heatmapOpacity,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0, 0, 255, 0)',
            0.2, 'rgb(0, 100, 255)',
            0.4, 'rgb(0, 255, 100)',
            0.6, 'rgb(255, 255, 0)',
            0.8, 'rgb(255, 100, 0)',
            1, 'rgb(255, 0, 0)',
          ],
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 15,
            15, 25,
          ],
          'heatmap-opacity': showHeatmap ? heatmapOpacity : 0,
        },
      });
    }

    // Liberty already includes 'building' and 'building-3d' layers (every building at z14) - no extra needed

    // Route layers will be added dynamically
    heatmapSourceAdded.current = true;
  }, [showHeatmap, heatmapOpacity]);

  // Update heatmap visibility and opacity
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    
    if (map.current.getLayer('heatmap-layer')) {
      map.current.setPaintProperty('heatmap-layer', 'heatmap-opacity', showHeatmap ? heatmapOpacity : 0);
      map.current.setPaintProperty('heatmap-layer', 'heatmap-intensity', heatmapOpacity);
    }
  }, [showHeatmap, heatmapOpacity, mapLoaded]);

  // Load heatmap data when bounds change
  useEffect(() => {
    if (!heatmapBounds || !showHeatmap || isLoadingHeatmap) return;
    
    const loadHeatmap = async () => {
      setIsLoadingHeatmap(true);
      try {
        const heatPoints = await getHeatmap(heatmapBounds);
        if (heatPoints.length > 0) {
          const features: GeoJSON.Feature[] = heatPoints.map(point => ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [point.lng, point.lat],
            },
            properties: {
              temperature: point.temperature,
              timestamp: point.timestamp,
            },
          }));
          
          const featureCollection: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features,
          };
          
          setHeatmapData(featureCollection);
          
          if (map.current?.getSource('heatmap')) {
            (map.current.getSource('heatmap') as maplibregl.GeoJSONSource).setData(featureCollection);
          }
        }
      } catch (error) {
        console.warn('Failed to load heatmap:', error);
      } finally {
        setIsLoadingHeatmap(false);
      }
    };
    
    loadHeatmap();
  }, [heatmapBounds, showHeatmap, isLoadingHeatmap]);

  // Update routes on map
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    
    // Remove existing route layers
    const layersToRemove = ['route-fastest', 'route-coolest', 'route-balanced', 'route-selected'];
    layersToRemove.forEach(id => {
      if (map.current?.getLayer(id)) map.current.removeLayer(id);
      if (map.current?.getSource(id)) map.current.removeSource(id);
    });
    
    // Add each route
    routes.forEach(route => {
      const layerId = `route-${route.name}`;
      const isSelected = selectedRoute?.id === route.id;
      
      const coords: [number, number][] = route.geometry.map(c => [c.lng, c.lat]);
      
      // Add source
      map.current!.addSource(layerId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
          properties: {
            name: route.label,
            color: route.color,
          },
        },
      });
      
      // Add route line layer
      map.current!.addLayer({
        id: layerId,
        type: 'line',
        source: layerId,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
           'line-color': route.color,
           'line-width': isSelected ? 8 : 5,
           'line-opacity': 1,
         },
      });
      
      // Add selected route highlight
      if (isSelected) {
        map.current!.addLayer({
          id: 'route-selected',
          type: 'line',
          source: layerId,
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
             'line-color': '#ffffff',
             'line-width': 12,
             'line-opacity': 0.4,
           },
        }, layerId); // Insert before the main route layer
      }
      
      // Move route layers below labels
      const labelLayers = ['place-label', 'road-label', 'poi-label'];
      for (const labelLayer of labelLayers) {
        if (map.current!.getLayer(labelLayer)) {
          map.current!.moveLayer(layerId, labelLayer);
          break;
        }
      }
    });
  }, [routes, selectedRoute, mapLoaded]);

  // Update markers - properly remove all previous markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    
    // Remove existing markers via stored refs
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    ['origin-marker', 'destination-marker'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    
    // Add origin marker
    if (origin) {
      const el = document.createElement('div');
      el.id = 'origin-marker';
      el.className = 'map-marker origin';
      el.innerHTML = `
        <div class="marker-pin" style="background: #22c55e;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </div>
        <div class="marker-label">Start</div>
      `;
      
      const m1 = new (maplibregl as any).Marker(el, { anchor: 'bottom' })
        .setLngLat([origin.lng, origin.lat])
        .addTo(map.current);
      markersRef.current.push(m1);
    }
    
    // Add destination marker
    if (destination) {
      const el = document.createElement('div');
      el.id = 'destination-marker';
      el.className = 'map-marker destination';
      el.innerHTML = `
        <div class="marker-pin" style="background: #ef4444;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
        <div class="marker-label">End</div>
      `;
      
      const m2 = new (maplibregl as any).Marker(el, { anchor: 'bottom' })
        .setLngLat([destination.lng, destination.lat])
        .addTo(map.current);
      markersRef.current.push(m2);
    }
  }, [origin, destination, mapLoaded]);

  // Fit bounds to selected route
  useEffect(() => {
    if (!map.current || !mapLoaded || !selectedRoute) return;
    
    const coords = selectedRoute.geometry;
    if (coords.length < 2) return;
    
    const bounds = new maplibregl.LngLatBounds();
    coords.forEach(c => bounds.extend([c.lng, c.lat]));
    
    map.current.fitBounds(bounds, {
      padding: 50,
      maxZoom: 16,
      duration: 1000,
    });
  }, [selectedRoute, mapLoaded]);

  return (
    <div
      ref={mapContainer}
      className={clsx('w-full h-full', className)}
      style={{ width: '100%', height: '100%', minHeight: '400px' }}
    >
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10 p-4">
          <div className="text-center text-red-600">
            <div className="font-semibold">Map failed to load</div>
            <div className="text-sm text-gray-600 mt-1">{mapError}</div>
            <button 
              onClick={() => { setMapError(null); window.location.reload(); }}
              className="mt-3 px-4 py-2 bg-teal-600 text-white rounded-xl text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      )}
      {!mapLoaded && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
          <div className="flex flex-col items-center gap-3 text-gray-600">
            <div className="animate-spin rounded-full h-10 w-10 border-3 border-teal-500 border-t-transparent"></div>
            <span className="text-sm font-medium">Loading map...</span>
          </div>
        </div>
      )}
      {isLoadingHeatmap && (
        <div className="absolute top-4 right-4 z-10 bg-white/90 backdrop-blur rounded-lg px-3 py-1.5 text-xs text-gray-600 flex items-center gap-1.5">
          <div className="animate-spin rounded-full h-3 w-3 border-2 border-teal-500 border-t-transparent"></div>
          Loading heat data...
        </div>
      )}
    </div>
  );
}