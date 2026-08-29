// Route Card Component

'use client';

import { useState } from 'react';
import type { RouteOption, RouteSegment, Coordinates } from '@/types';
import { formatDuration, formatDistance, getWBGTColor, getWBGTLabel } from '@/lib/heat-calculations';
import { clsx } from 'clsx';
import {
  Clock,
  MapPin,
  Droplets,
  Sun,
  TreePine,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
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

const RISK_COLORS = {
  safe: 'text-green-600 bg-green-50 border-green-200',
  caution: 'text-orange-600 bg-orange-50 border-orange-200',
  danger: 'text-red-600 bg-red-50 border-red-200',
  extreme: 'text-red-900 bg-red-100 border-red-300',
};

function getRiskLevel(score: number): keyof typeof RISK_COLORS {
  if (score < 30) return 'safe';
  if (score < 55) return 'caution';
  if (score < 80) return 'danger';
  return 'extreme';
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
  const riskLevel = getRiskLevel(route.maxRiskScore);
  const wbgtColor = getWBGTColor(route.averageWbgt);
  const wbgtLabel = getWBGTLabel(route.averageWbgt);
  
  // Calculate segment stats
  const highRiskSegments = route.segments.filter(s => s.riskScore >= 55).length;
  const totalSegments = route.segments.length;
  const avgShade = route.segments.reduce((sum, s) => sum + s.shadeCoverage, 0) / totalSegments;

  return (
    <div
      className={clsx(
        'relative rounded-xl border-2 transition-all duration-200 overflow-hidden',
        isSelected
          ? 'border-teal-500 bg-teal-50 shadow-lg shadow-teal-100'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
      )}
      onClick={onSelect}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute inset-0 bg-teal-500/5 pointer-events-none" />
      )}
      
      {/* Main route summary */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Mode indicator */}
          <div
            className={clsx(
              'flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center',
              `bg-${route.color.replace('#', '')}20`
            )}
            style={{ borderColor: route.color }}
          >
            <span className="text-2xl">{index + 1}</span>
          </div>
          
          {/* Route info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-gray-900 truncate">{route.label}</h3>
                <span
                  className={clsx(
                    'px-2 py-0.5 text-xs font-medium rounded-full',
                    RISK_COLORS[riskLevel]
                  )}
                >
                  {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} Risk
                </span>
              </div>
              {onExpand && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onExpand();
                  }}
                  className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showSegments ? 'Collapse details' : 'Expand details'}
                >
                  {showSegments ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              )}
            </div>
            
            <p className="text-sm text-gray-500 mt-1 truncate">{route.description}</p>
            
            {/* Key metrics */}
            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
              <div className="flex items-center gap-1.5 text-gray-600">
                <Clock size={14} />
                <span>{formatDuration(route.totalDuration)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-600">
                <MapPin size={14} />
                <span>{formatDistance(route.totalDistance)}</span>
              </div>
              <div className="flex items-center gap-1.5" style={{ color: wbgtColor }}>
                <Sun size={14} />
                <span className="font-medium">{route.averageWbgt.toFixed(1)}°C WBGT</span>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${wbgtColor}20` }}>
                  {wbgtLabel}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-teal-600">
                <TreePine size={14} />
                <span>{Math.round(route.shadePercentage)}% shade</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Expandable segment details */}
        {onExpand && (
          <div className={clsx('mt-3 overflow-hidden transition-all duration-300', showSegments ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0')}>
            <div className="border-t border-gray-100 pt-3 space-y-2">
              {route.segments.slice(0, 8).map((segment, segIdx) => (
                <SegmentRow
                  key={segIdx}
                  segment={segment}
                  index={segIdx}
                  profileId={profileId}
                />
              ))}
              {route.segments.length > 8 && (
                <div className="text-center text-sm text-gray-500 py-2">
                  +{route.segments.length - 8} more segments
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Water stops indicator */}
      {route.waterStops.length > 0 && (
        <div className="px-4 pb-4 pt-0 border-t border-gray-100">
          <div className="flex items-center gap-2 text-sm text-teal-600">
            <Droplets size={14} />
            <span>{route.waterStops.length} water stop{route.waterStops.length > 1 ? 's' : ''} along route</span>
            <ChevronRight size={14} className="ml-auto text-gray-300" />
          </div>
        </div>
      )}
    </div>
  );
}

function SegmentRow({ segment, index, profileId }: { segment: RouteSegment; index: number; profileId: string }) {
  const riskLevel = getRiskLevel(segment.riskScore);
  const wbgtColor = getWBGTColor(segment.wbgt);
  
  return (
    <div className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-gray-50">
      <span className="w-5 text-center text-gray-400 font-mono">{index + 1}</span>
      
      {segment.streetName && (
        <span className="flex-1 truncate font-medium text-gray-700">{segment.streetName}</span>
      )}
      
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={clsx(
            'px-1.5 py-0.5 rounded text-[10px] font-medium',
            RISK_COLORS[riskLevel]
          )}
        >
          {segment.riskScore}
        </span>
        
        <span className="flex items-center gap-0.5" style={{ color: wbgtColor }}>
          <Sun size={10} />
          {segment.wbgt.toFixed(1)}°
        </span>
        
        {segment.shadeCoverage > 0.3 && (
          <span className="flex items-center gap-0.5 text-teal-600">
            <TreePine size={10} />
            {Math.round(segment.shadeCoverage * 100)}%
          </span>
        )}
        
        <span className="text-gray-400 font-mono ml-auto">
          {formatDistance(segment.distance)}
        </span>
      </div>
    </div>
  );
}

// Compact route card for mobile drawer
export function CompactRouteCard({
  route,
  isSelected,
  onSelect,
}: {
  route: RouteOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const riskLevel = getRiskLevel(route.maxRiskScore);
  const wbgtColor = getWBGTColor(route.averageWbgt);
  
  return (
    <button
      onClick={onSelect}
      className={clsx(
        'w-full p-3 rounded-xl border-2 transition-all duration-200 text-left',
        isSelected
          ? 'border-teal-500 bg-teal-50'
          : 'border-gray-200 bg-white'
      )}
      style={{ borderLeftColor: route.color, borderLeftWidth: isSelected ? 4 : 2 }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
            style={{ background: route.color }}
          >
            {route.label[0]}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-gray-900 truncate">{route.label}</span>
              <span
                className={clsx(
                  'px-1.5 py-0.5 text-[10px] font-medium rounded',
                  RISK_COLORS[riskLevel]
                )}
              >
                {riskLevel}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
              <span className="flex items-center gap-0.5" style={{ color: wbgtColor }}>
                <Sun size={10} />
                {route.averageWbgt.toFixed(1)}°C
              </span>
              <span className="flex items-center gap-0.5 text-teal-600">
                <TreePine size={10} />
                {Math.round(route.shadePercentage)}% shade
              </span>
              <span className="flex items-center gap-0.5">
                <Clock size={10} />
                {formatDuration(route.totalDuration)}
              </span>
            </div>
          </div>
        </div>
        {isSelected && (
          <CheckCircle size={20} className="text-teal-500 flex-shrink-0" />
        )}
      </div>
    </button>
  );
}