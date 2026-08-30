'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { calculateDemoRoutes, calculateHeatAwareRoutes } from '@/lib/routing-engine';
import { MapComponent } from '@/components/map/MapComponent';
import { RouteCard, CompactRouteCard } from '@/components/routes/RouteCard';
import { ProfileSelector } from '@/components/profile/ProfileSelector';
import { USER_PROFILES, DEMO_ROUTES } from '@/types';
import { formatDistance, formatDuration, getWBGTColor, getWBGTLabel } from '@/lib/heat-calculations';
import { isInUSA } from '@/lib/usa-bounds';
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
} from 'lucide-react';

export default function HomePage() {
  const {
    origin, destination, setOrigin, setDestination,
    selectedProfile, setSelectedProfile,
    selectedMode, setSelectedMode,
    routes, setRoutes, selectedRoute, setSelectedRoute,
    isRouting, setIsRouting, routingError, setRoutingError,
    mapCenter, setMapCenter, mapZoom, setMapZoom,
    showHeatmap, heatmapOpacity,
    useDemoMode, setUseDemoMode,
    avoidHighHeat, activeTab, setActiveTab,
  } = useAppStore();

  const [hasInitialized, setHasInitialized] = useState(false);
  const [originInput, setOriginInput] = useState('Phoenix — Roosevelt Row');
  const [destInput, setDestInput] = useState('Downtown Arts District');

  const runRouting = useCallback(async () => {
    if (!origin || !destination) return;
    setIsRouting(true);
    setRoutingError(null);
    try {
      const req: any = {
        origin,
        destination,
        profileId: selectedProfile.id,
        mode: selectedMode,
        avoidHighHeat,
        maxDetourFactor: 1.5,
      };
      const res = useDemoMode ? await calculateDemoRoutes(req) : await calculateHeatAwareRoutes(req);
      setRoutes(res.routes);
      if (res.routes.length > 0) setSelectedRoute(res.routes.find(r => r.name === selectedMode) || res.routes[0]);
      if (res.warnings?.length) setRoutingError(res.warnings[0]);
    } catch (e: any) {
      console.warn('Live routing failed, falling back to demo:', e?.message);
      try {
        const req2: any = { origin, destination, profileId: selectedProfile.id, mode: selectedMode };
        const res2 = await calculateDemoRoutes(req2);
        setRoutes(res2.routes);
        setSelectedRoute(res2.routes.find(r => r.name === selectedMode) || res2.routes[0]);
        setRoutingError(`Live API failed (${e?.message?.slice(0,120) || 'unknown'}). Showing demo-simulated USA heat — click Demo Mode to hide this.`);
      } catch (e2: any) {
        setRoutingError(e2?.message || 'Routing failed');
      }
    } finally {
      setIsRouting(false);
    }
  }, [origin, destination, selectedProfile.id, selectedMode, avoidHighHeat, useDemoMode]);

  // Synchronous initial route calculation for immediate display
  useEffect(() => {
    if (!hasInitialized && origin && destination && routes.length === 0) {
      setHasInitialized(true);
      runRouting();
    }
  }, [hasInitialized, origin, destination, routes.length, runRouting]);

  useEffect(() => {
    runRouting();
  }, [runRouting]);

  const handleDemoPick = (id: string) => {
    const d = DEMO_ROUTES.find(x => x.id === id);
    if (!d) return;
    setOrigin(d.origin);
    setDestination(d.destination);
    setOriginInput(d.name.split(' - ')[0]);
    setDestInput(d.name.split(' - ')[1] || 'Destination');
    const p = USER_PROFILES.find(x => x.id === d.profileId);
    if (p) setSelectedProfile(p);
  };

  const handleSwap = () => {
    const o = origin; const dest = destination;
    setOrigin(dest); setDestination(o);
    const oi = originInput; setOriginInput(destInput); setDestInput(oi);
  };

  const heatmapBounds = selectedRoute ? {
    minLat: Math.min(...selectedRoute.geometry.map(c => c.lat)) - 0.005,
    minLng: Math.min(...selectedRoute.geometry.map(c => c.lng)) - 0.005,
    maxLat: Math.max(...selectedRoute.geometry.map(c => c.lat)) + 0.005,
    maxLng: Math.max(...selectedRoute.geometry.map(c => c.lng)) + 0.005,
  } : null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white">
              <ThermometerSun size={18} />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 leading-none">CoolRoutes</h1>
              <p className="text-[11px] text-gray-500 hidden sm:block">Heat-safe navigation • FortyGuard</p>
            </div>
            <span className="hidden md:inline-flex ml-2 px-2 py-1 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200">HACKATHON&apos;26</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full" style={{ background: selectedProfile.id === 'elderly' ? '#ef4444' : '#22c55e' }} />
              {selectedProfile.name}
            </span>
            <button
              onClick={() => setUseDemoMode(!useDemoMode)}
              className={cn('px-3 py-1.5 rounded-full text-xs font-medium border', useDemoMode ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-700 border-gray-300')}
            >
              {useDemoMode ? 'Demo Mode' : 'Live API Mode'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-[1400px] mx-auto px-4 pb-3 flex gap-2 overflow-x-auto">
          {(['routes','profile','demo'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn('px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap', activeTab===tab ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
            >
              {tab === 'routes' ? 'Routes' : tab === 'profile' ? 'Vulnerable Profile' : 'Demo Scenarios'}
            </button>
          ))}
          <span className="ml-auto hidden lg:flex items-center gap-1 text-[11px] text-gray-400">
            <Sparkles size={12} /> Powered by FortyGuard 2m Temperature Intelligence • 115x more accurate
          </span>
        </div>
      </header>

      <div className="flex-1 max-w-[1400px] w-full mx-auto flex flex-col lg:flex-row gap-0 lg:gap-4 p-0 lg:p-4">
        {/* Left Panel */}
        <div className="w-full lg:w-[380px] lg:shrink-0 bg-white lg:rounded-2xl lg:border lg:shadow-sm flex flex-col max-h-[45vh] lg:max-h-[calc(100vh-140px)] lg:overflow-hidden order-2 lg:order-1">
          <div className="p-4 border-b bg-gradient-to-r from-teal-50 to-cyan-50">
            <div className="space-y-3">
              <div className="relative">
                <MapPin size={14} className="absolute left-3 top-3.5 text-green-600" />
                <input
                  value={originInput}
                  onChange={e => setOriginInput(e.target.value)}
                  placeholder="Start location"
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                />
                <button onClick={handleSwap} className="absolute right-2 top-2 p-1.5 rounded-lg bg-white border shadow-sm hover:bg-gray-50">
                  <Navigation size={14} className="rotate-90" />
                </button>
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-3.5 text-red-500" />
                <input
                  value={destInput}
                  onChange={e => setDestInput(e.target.value)}
                  placeholder="Destination"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
            {routingError && (
              <div className="mt-3 flex gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{routingError}</span>
                <button onClick={() => setRoutingError(null)} className="ml-auto"><X size={14} /></button>
              </div>
            )}
            <div className="flex gap-2 mt-3">
              {(['fastest','coolest','balanced'] as const).map(m => (
                <button key={m} onClick={() => setSelectedMode(m)} className={cn('flex-1 py-2 rounded-xl text-xs font-bold capitalize border', selectedMode===m ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200')}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-4">
            {activeTab === 'profile' && (
              <div>
                <h3 className="font-semibold text-sm mb-2">Who is traveling?</h3>
                <p className="text-xs text-gray-500 mb-3">Vulnerability affects heat thresholds and recommended shade. Elderly and medical profiles get cooler routes prioritized.</p>
                <ProfileSelector selectedProfile={selectedProfile} onSelect={setSelectedProfile} />
              </div>
            )}

            {activeTab === 'demo' && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Try a demo scenario (judge-ready)</h3>
                {DEMO_ROUTES.map(d => (
                  <button key={d.id} onClick={() => handleDemoPick(d.id)} className="w-full p-3 rounded-xl border text-left hover:border-teal-300 hover:bg-teal-50 text-xs">
                    <div className="font-semibold text-gray-900">{d.name}</div>
                    <div className="text-gray-500 mt-1">{d.description}</div>
                    <div className="mt-1.5 text-[11px] text-teal-700 font-medium">{d.expectedOutcome}</div>
                  </button>
                ))}
                <div className="p-3 rounded-xl bg-gray-900 text-white text-xs">
                  <div className="font-bold flex items-center gap-1"><Sparkles size={12} /> Pitch tip</div>
                  <div className="text-gray-300 mt-1">Pick <b>Elderly</b> + <b>Coolest</b> route on Dubai Marina. Show 3°C difference, shade %, and WBGT risk drop. Judges love the live map + risk cards.</div>
                </div>
              </div>
            )}

            {activeTab === 'routes' && (
              <>
                {isRouting ? (
                  <div className="flex flex-col items-center py-8 text-gray-500">
                    <Loader2 className="animate-spin text-teal-500" />
                    <span className="text-xs mt-2">Calculating heat-aware routes…</span>
                    <span className="text-[11px] text-gray-400">Fusing OSRM + FortyGuard heatmap + WBGT</span>
                  </div>
                ) : routes.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-500">No routes yet. Pick origin/destination.</div>
                ) : (
                  <div className="space-y-3">
                    {routes.map((r, idx) => (
                      <RouteCard key={r.id} route={r} isSelected={selectedRoute?.id===r.id} onSelect={() => setSelectedRoute(r)} profileId={selectedProfile.id} index={idx} />
                    ))}
                  </div>
                )}

                {selectedRoute && (
                  <div className="p-3 rounded-xl bg-gray-50 border space-y-2">
                    <h4 className="font-semibold text-sm flex items-center gap-2"><ThermometerSun size={14} /> Selected: {selectedRoute.label}</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white p-2 rounded-lg border"><div className="text-gray-500">Distance</div><div className="font-semibold">{formatDistance(selectedRoute.totalDistance)}</div></div>
                      <div className="bg-white p-2 rounded-lg border"><div className="text-gray-500">Time</div><div className="font-semibold">{formatDuration(selectedRoute.totalDuration)}</div></div>
                      <div className="bg-white p-2 rounded-lg border"><div className="text-gray-500">Avg WBGT</div><div className="font-semibold" style={{color: getWBGTColor(selectedRoute.averageWbgt)}}>{selectedRoute.averageWbgt.toFixed(1)}°C • {getWBGTLabel(selectedRoute.averageWbgt)}</div></div>
                      <div className="bg-white p-2 rounded-lg border"><div className="text-gray-500">Shade</div><div className="font-semibold">{Math.round(selectedRoute.shadePercentage)}%</div></div>
                    </div>
                    {selectedRoute.waterStops.length>0 && (
                      <div className="text-xs text-teal-700 flex items-center gap-1.5"><MapPin size={12} /> {selectedRoute.waterStops.length} water stops along route</div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="p-3 border-t bg-white hidden lg:block">
            <div className="flex gap-2">
              <button onClick={runRouting} disabled={isRouting} className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                {isRouting ? <Loader2 size={16} className="animate-spin" /> : <Navigation size={16} />} Re-calculate
              </button>
              <button onClick={() => { setOrigin(null); setDestination(null); setOriginInput(''); setDestInput(''); }} className="px-4 py-2.5 rounded-xl border text-sm">Clear</button>
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 min-h-[50vh] lg:min-h-0 lg:rounded-2xl overflow-hidden border bg-white shadow-sm relative order-1 lg:order-2 h-[50vh] lg:h-[calc(100vh-140px)]">
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
            onMapClick={(c) => {
              if (!isInUSA(c.lat, c.lng)) {
                setRoutingError('USA-only coverage: please pick a location inside the United States (this FortyGuard key covers USA only)');
                return;
              }
              if (!origin) setOrigin(c);
              else if (!destination) setDestination(c);
              else setDestination(c);
            }}
          />
          {/* Mobile floating route switcher */}
          <div className="lg:hidden absolute bottom-3 left-3 right-3 flex gap-2 overflow-x-auto">
            {routes.slice(0,3).map(r => (
              <button key={r.id} onClick={() => setSelectedRoute(r)} className={cn('flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold shadow-lg border flex items-center gap-2', selectedRoute?.id===r.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700')}>
                <span className="w-2 h-2 rounded-full" style={{ background: r.color }} /> {r.label} <ChevronRight size={12} />
              </button>
            ))}
          </div>
          {!selectedRoute && (
            <div className="absolute top-3 left-3 bg-white/95 backdrop-blur px-3 py-2 rounded-xl shadow text-xs text-gray-600 border">
              Tap map to set start/end • Toggle Coolest to see heat avoidance
            </div>
          )}
        </div>
      </div>

      <footer className="text-center py-3 text-[11px] text-gray-400">
        USA-only deployment • FortyGuard USA key + OSRM (free) + MapLibre (free) • No paid APIs • Demo mode offline • <span className="font-semibold text-teal-600">CoolRoutes</span> for FortyGuard Hackathon&apos;26
      </footer>
    </div>
  );
}
