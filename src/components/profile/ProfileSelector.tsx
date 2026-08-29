// User Profile Selector Component
'use client';

import type { UserProfile } from '@/types';
import { USER_PROFILES } from '@/types';
import { clsx } from 'clsx';
import {
  User,
  Baby,
  HardHat,
  HeartPulse,
  Activity,
  Stethoscope,
  Check,
  TreePine,
  AlertTriangle,
} from 'lucide-react';

interface ProfileSelectorProps {
  selectedProfile: UserProfile;
  onSelect: (profile: UserProfile) => void;
  compact?: boolean;
}

const PROFILE_ICONS: Record<string, any> = {
  healthy_adult: Activity,
  elderly: User,
  child: Baby,
  outdoor_worker: HardHat,
  pregnant: HeartPulse,
  medical_condition: Stethoscope,
};

export function ProfileSelector({
  selectedProfile,
  onSelect,
  compact = false,
}: ProfileSelectorProps) {
  if (compact) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
        {USER_PROFILES.map((profile) => (
          <button
            key={profile.id}
            onClick={() => onSelect(profile)}
            className={clsx(
              'flex-shrink-0 flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-200 min-w-[95px]',
              selectedProfile.id === profile.id
                ? 'border-teal-500 bg-teal-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-gray-300'
            )}
          >
            <div className={clsx(
              'w-10 h-10 rounded-xl flex items-center justify-center',
              selectedProfile.id === profile.id ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-600'
            )}>
              {(() => {
                const Icon = PROFILE_ICONS[profile.id];
                return <Icon size={20} />;
              })()}
            </div>
            <span className="text-xs font-medium text-gray-900 text-center leading-tight">
              {profile.name}
            </span>
            <span className="text-[10px] text-gray-500">{profile.vulnerabilityMultiplier}x risk</span>
            {selectedProfile.id === profile.id && <Check className="text-teal-500" size={14} />}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {USER_PROFILES.map((profile) => (
        <button
          key={profile.id}
          onClick={() => onSelect(profile)}
          className={clsx(
            'w-full p-4 rounded-xl border-2 transition-all text-left',
            selectedProfile.id === profile.id
              ? 'border-teal-500 bg-teal-50 shadow-md'
              : 'border-gray-200 bg-white hover:border-gray-300'
          )}
        >
          <div className="flex items-start gap-4">
            <div className={clsx(
              'flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center',
              selectedProfile.id === profile.id ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-600'
            )}>
              {(() => {
                const Icon = PROFILE_ICONS[profile.id];
                return <Icon size={22} />;
              })()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-900 text-sm">{profile.name}</h4>
                {selectedProfile.id === profile.id && <Check className="text-teal-500" size={18} />}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{profile.description}</p>
              <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">{profile.vulnerabilityMultiplier}x vulnerable</span>
                <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full flex items-center gap-1"><AlertTriangle size={10} />Max {profile.maxAcceptableRisk}%</span>
                <span className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded-full flex items-center gap-1"><TreePine size={10} />{Math.round(profile.preferredShade * 100)}% shade</span>
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
