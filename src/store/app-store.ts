// Global state management with Zustand

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Coordinates,
  UserProfile,
  RouteOption,
  RouteRequest,
  RouteResponse,
  DemoRoute,
} from '@/types';
import { USER_PROFILES, DEMO_ROUTES } from '@/types';

interface AppState {
  // User location & selection
  userLocation: Coordinates | null;
  origin: Coordinates | null;
  destination: Coordinates | null;
  selectedProfile: UserProfile;
  selectedMode: 'fastest' | 'coolest' | 'balanced';
  
  // Routing state
  routes: RouteOption[];
  selectedRoute: RouteOption | null;
  isRouting: boolean;
  routingError: string | null;
  lastRouteResponse: RouteResponse | null;
  
  // Map state
  mapCenter: Coordinates;
  mapZoom: number;
  showHeatmap: boolean;
  heatmapOpacity: number;
  
  // UI state
  isDrawerOpen: boolean;
  activeTab: 'routes' | 'profile' | 'settings' | 'demo';
  demoRoutes: DemoRoute[];
  selectedDemo: DemoRoute | null;
  
  // Settings
  avoidHighHeat: boolean;
  maxDetourFactor: number;
  useDemoMode: boolean;
  
  // Actions
  setUserLocation: (loc: Coordinates | null) => void;
  setOrigin: (loc: Coordinates | null) => void;
  setDestination: (loc: Coordinates | null) => void;
  swapOriginDestination: () => void;
  setSelectedProfile: (profile: UserProfile) => void;
  setSelectedMode: (mode: 'fastest' | 'coolest' | 'balanced') => void;
  setRoutes: (routes: RouteOption[]) => void;
  setSelectedRoute: (route: RouteOption | null) => void;
  setIsRouting: (loading: boolean) => void;
  setRoutingError: (error: string | null) => void;
  setLastRouteResponse: (response: RouteResponse | null) => void;
  setMapCenter: (center: Coordinates) => void;
  setMapZoom: (zoom: number) => void;
  toggleHeatmap: () => void;
  setHeatmapOpacity: (opacity: number) => void;
  setDrawerOpen: (open: boolean) => void;
  setActiveTab: (tab: 'routes' | 'profile' | 'settings' | 'demo') => void;
  setSelectedDemo: (demo: DemoRoute | null) => void;
  loadDemoRoute: (demo: DemoRoute) => void;
  setAvoidHighHeat: (avoid: boolean) => void;
  setMaxDetourFactor: (factor: number) => void;
  setUseDemoMode: (demo: boolean) => void;
  clearRoute: () => void;
  reset: () => void;
}

const DEFAULT_CENTER: Coordinates = {
  lat: parseFloat(process.env.NEXT_PUBLIC_DEFAULT_CENTER_LAT || '33.4484'),
  lng: parseFloat(process.env.NEXT_PUBLIC_DEFAULT_CENTER_LNG || '-112.0740'),
};

const DEFAULT_ZOOM = parseInt(process.env.NEXT_PUBLIC_DEFAULT_ZOOM || '13', 10);

const DEMO_ORIGIN = DEMO_ROUTES[0].origin;
const DEMO_DEST = DEMO_ROUTES[0].destination;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state — pre-filled USA demo so Vercel shows routes instantly
      userLocation: null,
      origin: DEMO_ORIGIN,
      destination: DEMO_DEST,
      selectedProfile: USER_PROFILES[0],
      selectedMode: 'balanced',
      routes: [],
      selectedRoute: null,
      isRouting: false,
      routingError: null,
      lastRouteResponse: null,
      mapCenter: DEFAULT_CENTER,
      mapZoom: DEFAULT_ZOOM,
      showHeatmap: true,
      heatmapOpacity: 0.7,
      isDrawerOpen: true,
      activeTab: 'routes',
      demoRoutes: DEMO_ROUTES,
      selectedDemo: null,
      avoidHighHeat: true,
      maxDetourFactor: 1.5,
      useDemoMode: process.env.NEXT_PUBLIC_DEMO_MODE === 'true',
      
      // Actions
      setUserLocation: (loc) => set({ userLocation: loc }),
      setOrigin: (loc) => set({ origin: loc }),
      setDestination: (loc) => set({ destination: loc }),
      swapOriginDestination: () => {
        const { origin, destination } = get();
        set({ origin: destination, destination: origin });
      },
      setSelectedProfile: (profile) => set({ selectedProfile: profile }),
      setSelectedMode: (mode) => set({ selectedMode: mode }),
      setRoutes: (routes) => set({ routes }),
      setSelectedRoute: (route) => set({ selectedRoute: route }),
      setIsRouting: (loading) => set({ isRouting: loading }),
      setRoutingError: (error) => set({ routingError: error }),
      setLastRouteResponse: (response) => set({ lastRouteResponse: response }),
      setMapCenter: (center) => set({ mapCenter: center }),
      setMapZoom: (zoom) => set({ mapZoom: zoom }),
      toggleHeatmap: () => set((s) => ({ showHeatmap: !s.showHeatmap })),
      setHeatmapOpacity: (opacity) => set({ heatmapOpacity: opacity }),
      setDrawerOpen: (open) => set({ isDrawerOpen: open }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setSelectedDemo: (demo) => set({ selectedDemo: demo }),
      loadDemoRoute: (demo) => {
        const profile = USER_PROFILES.find(p => p.id === demo.profileId) || USER_PROFILES[0];
        set({
          origin: demo.origin,
          destination: demo.destination,
          selectedProfile: profile,
          selectedDemo: demo,
          activeTab: 'routes',
        });
      },
      setAvoidHighHeat: (avoid) => set({ avoidHighHeat: avoid }),
      setMaxDetourFactor: (factor) => set({ maxDetourFactor: factor }),
      setUseDemoMode: (demo) => set({ useDemoMode: demo }),
      clearRoute: () => set({
        routes: [],
        selectedRoute: null,
        routingError: null,
        lastRouteResponse: null,
      }),
      reset: () => set({
        origin: null,
        destination: null,
        routes: [],
        selectedRoute: null,
        routingError: null,
        lastRouteResponse: null,
        selectedDemo: null,
      }),
    }),
    {
      name: 'coolroutes-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedProfile: state.selectedProfile,
        selectedMode: state.selectedMode,
        mapCenter: state.mapCenter,
        mapZoom: state.mapZoom,
        showHeatmap: state.showHeatmap,
        heatmapOpacity: state.heatmapOpacity,
        avoidHighHeat: state.avoidHighHeat,
        maxDetourFactor: state.maxDetourFactor,
        useDemoMode: state.useDemoMode,
      }),
    }
  )
);

// Selectors for common derived state
export const useRouteRequest = () => {
  const { origin, destination, selectedProfile, selectedMode, avoidHighHeat, maxDetourFactor } = useAppStore();
  return { origin, destination, selectedProfile, selectedMode, avoidHighHeat, maxDetourFactor };
};

export const useRoutingState = () => {
  const { routes, selectedRoute, isRouting, routingError, lastRouteResponse } = useAppStore();
  return { routes, selectedRoute, isRouting, routingError, lastRouteResponse };
};

export const useMapState = () => {
  const { mapCenter, mapZoom, showHeatmap, heatmapOpacity } = useAppStore();
  return { mapCenter, mapZoom, showHeatmap, heatmapOpacity };
};

export const useUIState = () => {
  const { isDrawerOpen, activeTab, selectedDemo, demoRoutes } = useAppStore();
  return { isDrawerOpen, activeTab, selectedDemo, demoRoutes };
};