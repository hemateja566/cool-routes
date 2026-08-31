'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { calculateHeatAwareRoutes } from '@/lib/routing-engine';
import { USER_PROFILES } from '@/types';
import dynamic from 'next/dynamic';

const MapComponent = dynamic(
  () => import('@/components/map/MapComponent').then((mod) => mod.MapComponent),
  { ssr: false, loading: () => <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400">Loading map...</div> }
);
import { RouteCard } from '@/components/routes/RouteCard';
import { ProfileSelector } from '@/components/profile/ProfileSelector';
import { formatDistance, formatDuration, getWBGTColor, getWBGTLabel } from '@/lib/heat-calculations';
import { cn } from '@/utils';
import {
  Search,
  MapPin,
  Navigation,
  Loader2,
  ThermometerSun,
  Sparkles,
  AlertTriangle,
  ChevronRight,
  X,
  MapPinned,
} from 'lucide-react';

export default function HomePage() {
  const {
    origin, destination, setOrigin, setDestination,
    selectedProfile, setSelectedProfile,
    selectedMode, setSelectedMode,
    routes, setRoutes, selectedRoute, setSelectedRoute,
    isRouting, setIsRouting, routingError, setRoutingError,
    mapCenter, setMapCenter, mapZoom, setMapZoom,
    showHeatmap, toggleHeatmap, heatmapOpacity,
    avoidHighHeat, setAvoidHighHeat,
    activeTab, setActiveTab,
    userLocation, setUserLocation,
    isDrawerOpen, setDrawerOpen,
    swapOriginDestination,
    lastRouteResponse, setLastRouteResponse,
  } = useAppStore();

  const heatmapBounds = lastRouteResponse?.heatmapBounds || null;

  const [originInput, setOriginInput] = useState('');
  const [destInput, setDestInput] = useState('');
  const [liveData, setLiveData] = useState<any>(null);
  const [liveStatus, setLiveStatus] = useState<'idle' | 'fetching' | 'completed' | 'error'>('idle');
  const [liveInfo, setLiveInfo] = useState<string>('');
  const [locatingUser, setLocatingUser] = useState(false);

  // ===== LIVE FORTYGUARD DATA - REQUIRED =====
  const fetchLiveFortyGuardData = useCallback(async (lat: number, lng: number) => {
    setLiveStatus('fetching');
    setLiveInfo('Fetching live temperature intelligence from FortyGuard...');
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

      const res = await fetch('/api/fortyguard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to fetch live data');
      }

      setLiveData(json.data);
      setLiveStatus('completed');
      const loc = json.data?.locations?.[0];
      if (loc) {
        setLiveInfo(`Live: ${loc.temperature}°C | Heat Index: ${loc.parameters?.heat_index_celsius?.[0]}°C | Humidity: ${loc.parameters?.relative_humidity_percent?.[0]}%`);
      }
    } catch (e: any) {
      console.error('Live FG error:', e?.message);
      setLiveStatus('error');
      setLiveInfo(`Live API error: ${e?.message} - Check FortyGuard key and try again`);
    }
  }, []);

  // Fetch live data on origin change
  useEffect(() => {
    if (origin) {
      fetchLiveFortyGuardData(origin.lat, origin.lng);
    }
  }, [origin?.lat, origin?.lng, fetchLiveFortyGuardData]);

  // ===== CURRENT LOCATION =====
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setLocatingUser(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setOrigin(loc);
        setOriginInput(`${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`);
        setLocatingUser(false);
        setMapCenter(loc);
      },
      () => {
        setLocatingUser(false);
        alert('Unable to get your location. Please check browser permissions.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // ===== ROUTE CALCULATION - LIVE ONLY =====
  const handleCalculateRoutes = useCallback(async () => {
    if (!origin || !destination) return;
    setIsRouting(true);
    setRoutingError(null);
    try {
      const request = {
        origin,
        destination,
        profileId: selectedProfile.id,
        mode: selectedMode,
        avoidHighHeat,
        maxDetourFactor: 1.5,
      };
      const response = await calculateHeatAwareRoutes(request);
      
      if (!response?.routes?.length) {
        throw new Error('No routes returned from live API');
      }
      setRoutes(response.routes);
      setLastRouteResponse(response);
      setSelectedRoute(response.routes[0]);
    } catch (err: any) {
      console.error('Routing error:', err?.message);
      setRoutingError(err?.message || 'Failed to calculate live routes. Check FortyGuard API and try again.');
      setRoutes([]);
    } finally {
      setIsRouting(false);
    }
  }, [origin, destination, selectedProfile, selectedMode, avoidHighHeat, setRoutes, setSelectedRoute, setIsRouting, setRoutingError, setLastRouteResponse]);

  // Auto-calculate routes when origin/destination change
  useEffect(() => {
    if (origin && destination) {
      handleCalculateRoutes();
    }
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, selectedProfile?.id, selectedMode, avoidHighHeat]);

  // Handle map click - max 2 locations, update destination if both exist
  const handleMapClick = (coords: { lat: number; lng: number }) => {
    if (!origin) {
      setOrigin(coords);
      setOriginInput(`${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
    } else if (!destination) {
      setDestination(coords);
      setDestInput(`${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
    } else {
      // Both set - update destination (visible route stays)
      setDestination(coords);
      setDestInput(`${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
    }
  };

  const currentHeatInfo = liveData?.locations?.[0]?.parameters;
  const heatIndex = currentHeatInfo?.heat_index_celsius?.[0];
  const humidity = currentHeatInfo?.relative_humidity_percent?.[0];
  const aqi = currentHeatInfo?.aqi_us_co?.[0];
  const wbgt = currentHeatInfo?.wet_bulb_temperature_celsius?.[0];

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-50">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg">
              <ThermometerSun className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">CoolRoutes</h1>
              <p className="text-xs text-gray-500">Heat-Safe Navigation • Live FortyGuard</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Live data indicator */}
            {liveStatus === 'fetching' && (
              <span className="flex items-center gap-1.5 text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">
                <Loader2 className="w-3 h-3 animate-spin" />
                Live
              </span>
            )}
            {liveStatus === 'completed' && (
              <span className="flex items-center gap-1.5 text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Live Data
              </span>
            )}
            {liveStatus === 'error' && (
              <span className="flex items-center gap-1.5 text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full">
                Live Error
              </span>
            )}

            <button
              onClick={handleGetCurrentLocation}
              disabled={locatingUser}
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
              title="Use current location"
            >
              {locatingUser ? (
                <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
              ) : (
                <MapPinned className="w-4 h-4 text-gray-600" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Map */}
      <div className="absolute inset-0 pt-16">
        <MapComponent
          center={mapCenter}
          zoom={mapZoom}
          onCenterChange={setMapCenter}
          onZoomChange={setMapZoom}
          routes={routes}
          selectedRoute={selectedRoute}
          origin={origin}
          destination={destination}
          showHeatmap={showHeatmap}
          heatmapOpacity={heatmapOpacity}
          heatmapBounds={heatmapBounds}
          onMapClick={handleMapClick}
        />
      </div>

      {/* Side Panel */}
      <div className="absolute top-16 left-0 bottom-0 w-full sm:w-96 z-20 flex flex-col bg-white/95 backdrop-blur-md shadow-2xl border-r border-gray-200 overflow-hidden">
        {/* Location Inputs - MAX 2 LOCATIONS */}
        <div className="p-4 border-b border-gray-100 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-600">
              {origin && destination ? '2/2 locations set • Route visible' : origin || destination ? '1/2 location set • Click map for second' : '0/2 locations • Click map to set points'}
            </p>
            {(origin || destination) && (
              <button
                onClick={() => { setOrigin(null); setDestination(null); setOriginInput(''); setDestInput(''); setRoutes([]); setRoutingError(null); }}
                className="text-xs text-red-500 hover:text-red-700 font-medium"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">1</span> Origin
              {origin && <span className="ml-auto text-xs text-green-600 font-normal">✓ set • <button onClick={() => { setOrigin(null); setOriginInput(''); }} className="underline hover:text-red-600">Remove</button></span>}
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 w-4 h-4 text-green-500" />
              <input
                type="text"
                readOnly
                placeholder="Click map or use current location"
                value={originInput}
                onChange={(e) => setOriginInput(e.target.value)}
                className={cn("w-full pl-9 pr-10 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent", origin ? "bg-green-50 border-green-300 text-gray-900" : "bg-gray-50 border-gray-200")}
              />
              {origin && (
                <button
                  onClick={() => { setOrigin(null); setOriginInput(''); }}
                  className="absolute right-2 top-2 p-1.5 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-300 shadow-sm"
                  title="Remove origin"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold">2</span> Destination
              {destination && <span className="ml-auto text-xs text-red-600 font-normal">✓ set • <button onClick={() => { setDestination(null); setDestInput(''); }} className="underline hover:text-red-600">Remove</button></span>}
            </label>
            <div className="relative">
              <Navigation className="absolute left-3 top-3 w-4 h-4 text-red-500" />
              <input
                type="text"
                readOnly
                placeholder="Click map for destination"
                value={destInput}
                onChange={(e) => setDestInput(e.target.value)}
                className={cn("w-full pl-9 pr-10 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent", destination ? "bg-red-50 border-red-300 text-gray-900" : "bg-gray-50 border-gray-200")}
              />
              {destination && (
                <button
                  onClick={() => { setDestination(null); setDestInput(''); }}
                  className="absolute right-2 top-2 p-1.5 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-300 shadow-sm"
                  title="Remove destination"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {origin && destination && (
            <button
              onClick={swapOriginDestination}
              className="w-full py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
            >
              <ChevronRight className="w-4 h-4 rotate-90" /> Swap Origin / Destination
            </button>
          )}
          <p className="text-xs text-gray-400 text-center">Route line appears on map between the 2 points</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {(['routes', 'profile', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex-1 py-2.5 text-xs font-medium capitalize transition-colors',
                activeTab === tab
                  ? 'text-teal-600 border-b-2 border-teal-600'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Live Data Banner */}
          {liveInfo && (
            <div className={cn(
              'p-3 rounded-xl text-xs',
              liveStatus === 'fetching' && 'bg-amber-50 text-amber-700 border border-amber-200',
              liveStatus === 'completed' && 'bg-green-50 text-green-700 border border-green-200',
              liveStatus === 'error' && 'bg-red-50 text-red-700 border border-red-200',
            )}>
              <div className="flex items-center gap-2">
                {liveStatus === 'fetching' && <Loader2 className="w-3 h-3 animate-spin" />}
                {liveStatus === 'completed' && <Sparkles className="w-3 h-3" />}
                {liveStatus === 'error' && <AlertTriangle className="w-3 h-3" />}
                <span>{liveInfo}</span>
              </div>
            </div>
          )}

          {/* Heat Stats */}
          {liveStatus === 'completed' && currentHeatInfo && (
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-xl p-3 text-center border border-orange-100">
                <ThermometerSun className="w-4 h-4 text-orange-500 mx-auto mb-1" />
                <div className="text-lg font-bold text-orange-700">{heatIndex}°</div>
                <div className="text-[10px] text-orange-500">Heat Index</div>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-3 text-center border border-blue-100">
                <div className="w-4 h-4 text-blue-500 mx-auto mb-1">💧</div>
                <div className="text-lg font-bold text-blue-700">{humidity}%</div>
                <div className="text-[10px] text-blue-500">Humidity</div>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-3 text-center border border-purple-100">
                <div className="w-4 h-4 text-purple-500 mx-auto mb-1">🌡</div>
                <div className="text-lg font-bold text-purple-700">{wbgt}°</div>
                <div className="text-[10px] text-purple-500">WBGT</div>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-3 text-center border border-green-100">
                <div className="w-4 h-4 text-green-500 mx-auto mb-1">🍃</div>
                <div className="text-lg font-bold text-green-700">{aqi}</div>
                <div className="text-[10px] text-green-500">AQI</div>
              </div>
            </div>
          )}

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <ProfileSelector
              selectedProfile={selectedProfile}
              onSelect={setSelectedProfile}
            />
          )}

          {/* Settings Tab - LIVE ONLY */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Show Heatmap (FortyGuard)</span>
                <button
                  onClick={toggleHeatmap}
                  className={cn(
                    'relative w-11 h-6 rounded-full transition-colors',
                    showHeatmap ? 'bg-teal-500' : 'bg-gray-300'
                  )}
                >
                  <span className={cn(
                    'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                    showHeatmap ? 'translate-x-5.5 left-[1px]' : 'translate-x-0.5 left-[1px]'
                  )} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Avoid High Heat</span>
                <button
                  onClick={() => setAvoidHighHeat(!avoidHighHeat)}
                  className={cn(
                    'relative w-11 h-6 rounded-full transition-colors',
                    avoidHighHeat ? 'bg-teal-500' : 'bg-gray-300'
                  )}
                >
                  <span className={cn(
                    'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                    avoidHighHeat ? 'translate-x-5.5 left-[1px]' : 'translate-x-0.5 left-[1px]'
                  )} />
                </button>
              </div>
              <div className="pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500">Live mode only. All routes require FortyGuard API. No demo data.</p>
                <p className="text-xs text-gray-400 mt-1">Powered by FortyGuard Temperature Intelligence + OSRM</p>
              </div>
            </div>
          )}

          {/* Routes Tab */}
          {activeTab === 'routes' && (
            <>
              {/* Mode Selector */}
              <div className="flex gap-2 mb-3">
                {(['fastest', 'coolest', 'balanced'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setSelectedMode(mode)}
                    className={cn(
                      'flex-1 py-2 rounded-xl text-xs font-medium capitalize transition-all border-2',
                      selectedMode === mode
                        ? mode === 'fastest'
                          ? 'bg-blue-500 text-white border-blue-500'
                          : mode === 'coolest'
                          ? 'bg-teal-500 text-white border-teal-500'
                          : 'bg-purple-500 text-white border-purple-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    )}
                  >
                    {mode === 'fastest' && '⚡ '}
                    {mode === 'coolest' && '❄️ '}
                    {mode === 'balanced' && '⚖️ '}
                    {mode}
                  </button>
                ))}
              </div>

              {/* Loading */}
              {isRouting && (
                <div className="flex items-center justify-center py-8 text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span className="text-sm">Calculating live heat-safe routes...</span>
                </div>
              )}

              {/* Error */}
              {routingError && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 inline mr-2" />
                  {routingError}
                </div>
              )}

              {/* Route Cards */}
              {!isRouting && routes.length > 0 && (
                <div className="space-y-3">
                  <div className="text-xs text-gray-500 font-medium">
                    {routes.length} live route{routes.length !== 1 ? 's' : ''} found
                    {selectedProfile && ` for ${selectedProfile.name}`}
                  </div>
                  {routes.map((route, idx) => (
                    <RouteCard
                      key={route.id}
                      route={route}
                      isSelected={selectedRoute?.id === route.id}
                      onSelect={() => setSelectedRoute(route)}
                      profileId={selectedProfile?.id || 'healthy_adult'}
                      index={idx}
                    />
                  ))}
                </div>
              )}

              {/* Empty State */}
              {!isRouting && routes.length === 0 && !routingError && (
                <div className="text-center py-12 text-gray-400">
                  <Search className="w-8 h-8 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Set origin & destination for live routes</p>
                  <p className="text-xs mt-1">Click on map or use current location • Live FortyGuard required</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
