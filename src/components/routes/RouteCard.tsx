// Route Card Component matching the blueprint spec
'use client';

import { useState } from 'react';
import type { RouteOption, RouteSegment } from '@/types';
import { formatDuration, formatDistance, getWBGTColor, getWBGTLabel } from '@/lib/heat-calculations';
import { clsx } from 'clsx';
import {
  Clock,
  MapPin,
  Sun,
  TreePine,
  Thermometer,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';

interface RouteCardProps {
  route: RouteOption;
  isSelected: boolean;
  onSelect: () => void;
  onExpand?: () => void;
  isExpanded?: boolean;
  profileId: string;
  index: number;
}

export function RouteCard({
  route,
  isSelected,
  onSelect,
  onExpand,
  isExpanded = false,
  profileId,
  index,
}: RouteCardProps) {
  const [showSegments, setShowSegments] = useState(isExpanded);
  
  const comfortScore = route.comfort_score ?? Math.round(Math.max(10, 100 - route.maxRiskScore));
  const avgTemp = route.avg_temp_c ?? Math.round(route.averageWbgt * 1.15 * 10) / 10;
  const maxTemp = route.max_temp_c ?? Math.round((avgTemp + 3.5) * 10) / 10;
  const distanceKm = route.distance_km ?? Math.round((route.totalDistance / 1000) * 10) / 10;
  const durationMin = route.duration_min ?? Math.round(route.totalDuration / 60);

  // Comfort score color
  const scoreColor = comfortScore >= 75
    ? 'bg-green-100 text-green-800 border-green-300'
    : comfortScore >= 50
    ? 'bg-purple-100 text-purple-800 border-purple-300'
    : 'bg-red-100 text-red-800 border-red-300';

  return (
    <div
      className={clsx(
        'relative rounded-2xl border-2 transition-all duration-200 overflow-hidden cursor-pointer',
        isSelected
          ? 'border-teal-500 bg-teal-50/50 shadow-lg shadow-teal-500/10'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
      )}
      onClick={onSelect}
    >
      {/* Top Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: route.color }}
            />
            <div className="truncate">
              <h3 className="font-bold text-gray-900 text-base truncate flex items-center gap-1.5">
                {route.label}
                {index === 0 && <Sparkles className="w-4 h-4 text-green-500 inline" />}
              </h3>
              <p className="text-xs text-gray-500 truncate">{route.description}</p>
            </div>
          </div>

          {/* Comfort Score Badge (Blueprint Section 4) */}
          <div className={clsx('px-3 py-1.5 rounded-xl border text-center flex-shrink-0', scoreColor)}>
            <div className="text-xs font-bold leading-none">{comfortScore}/100</div>
            <div className="text-[10px] font-medium opacity-80 mt-0.5">Comfort</div>
          </div>
        </div>

        {/* 4 Stats Grid (Blueprint Section 4: distance, duration, avg temp, max temp) */}
        <div className="grid grid-cols-4 gap-2 mt-3.5 pt-3 border-t border-gray-100">
          <div className="bg-gray-50 rounded-xl p-2 text-center">
            <div className="text-[10px] text-gray-500 font-medium">Distance</div>
            <div className="text-xs font-bold text-gray-900 mt-0.5">{distanceKm} km</div>
          </div>

          <div className="bg-gray-50 rounded-xl p-2 text-center">
            <div className="text-[10px] text-gray-500 font-medium">Time</div>
            <div className="text-xs font-bold text-gray-900 mt-0.5">{durationMin} min</div>
          </div>

          <div className="bg-orange-50/70 rounded-xl p-2 text-center border border-orange-100">
            <div className="text-[10px] text-orange-600 font-medium">Avg Temp</div>
            <div className="text-xs font-bold text-orange-700 mt-0.5">{avgTemp}°C</div>
          </div>

          <div className="bg-teal-50/70 rounded-xl p-2 text-center border border-teal-100">
            <div className="text-[10px] text-teal-600 font-medium">Shade</div>
            <div className="text-xs font-bold text-teal-700 mt-0.5">{Math.round(route.shadePercentage)}%</div>
          </div>
        </div>

        {/* Turn-by-turn expandable trigger */}
        {route.segments.length > 0 && (
          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Thermometer className="w-3.5 h-3.5 text-gray-400" />
              Peak: <span className="font-semibold text-gray-700">{maxTemp}°C</span>
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSegments(!showSegments);
              }}
              className="text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
            >
              {showSegments ? 'Hide directions' : `View ${route.segments.length} steps`}
              {showSegments ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}

        {/* Segments view */}
        {showSegments && route.segments.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 max-h-60 overflow-y-auto">
            {route.segments.map((seg, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs py-1">
                <span className="w-4 h-4 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800">{seg.instructions || seg.streetName || `Step ${idx + 1}`}</div>
                  <div className="text-gray-400 text-[10px]">
                    {Math.round(seg.distance)}m • {Math.round(seg.shadeCoverage * 100)}% shade • WBGT {seg.wbgt.toFixed(1)}°C
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CompactRouteCard({
  route,
  isSelected,
  onSelect,
}: {
  route: RouteOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const comfortScore = route.comfort_score ?? Math.round(Math.max(10, 100 - route.maxRiskScore));
  const avgTemp = route.avg_temp_c ?? Math.round(route.averageWbgt * 1.15 * 10) / 10;
  
  return (
    <button
      onClick={onSelect}
      className={clsx(
        'w-full p-3 rounded-xl border-2 transition-all duration-200 text-left',
        isSelected
          ? 'border-teal-500 bg-teal-50'
          : 'border-gray-200 bg-white'
      )}
      style={{ borderLeftColor: route.color, borderLeftWidth: 4 }}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-bold text-sm text-gray-900">{route.label}</div>
          <div className="text-xs text-gray-500">{route.duration_min || Math.round(route.totalDuration / 60)} min • {avgTemp}°C</div>
        </div>
        <div className="px-2 py-1 rounded-lg bg-teal-100 text-teal-800 font-bold text-xs">
          {comfortScore}/100
        </div>
      </div>
    </button>
  );
}
