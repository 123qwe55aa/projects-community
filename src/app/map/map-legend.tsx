'use client';

import { useState } from 'react';

const BUILDING_STYLES = [
  { key: 'workshop', label: 'Workshop', description: 'Small workshop with chimney', color: '#f59e0b', bgColor: 'bg-amber-900/30' },
  { key: 'data-center', label: 'Data Center', description: 'Tall tower with antenna', color: '#06b6d4', bgColor: 'bg-cyan-900/30' },
  { key: 'studio', label: 'Studio', description: 'Wide flat with big windows', color: '#a855f7', bgColor: 'bg-purple-900/30' },
  { key: 'community-hall', label: 'Community Hall', description: 'Grand hall with columns', color: '#22c55e', bgColor: 'bg-green-900/30' },
] as const;

const GROWTH_STAGES = [
  { key: 'seedling', label: 'Seedling', scale: '0.4x', color: '#a3e635', dot: 'bg-lime-400' },
  { key: 'sprouting', label: 'Sprouting', scale: '0.6x', color: '#22c55e', dot: 'bg-green-500' },
  { key: 'growing', label: 'Growing', scale: '0.8x', color: '#14b8a6', dot: 'bg-teal-500' },
  { key: 'mature', label: 'Mature', scale: '1.0x', color: '#f59e0b', dot: 'bg-amber-500' },
] as const;

export function MapLegend() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500 transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <rect x="2" y="8" width="4" height="6" fill="#f59e0b" opacity="0.8" />
          <rect x="7" y="4" width="3" height="10" fill="#06b6d4" opacity="0.8" />
          <rect x="11" y="7" width="3" height="7" fill="#a855f7" opacity="0.8" />
        </svg>
        Legend
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-30 w-64 rounded-lg border border-zinc-700 bg-zinc-900/95 backdrop-blur-sm p-4 shadow-xl">
          {/* Building Styles */}
          <div className="space-y-1 mb-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Building Styles
            </h3>
            {BUILDING_STYLES.map((style) => (
              <div key={style.key} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: style.color }}
                />
                <div>
                  <span className="text-sm text-zinc-200">{style.label}</span>
                  <span className="text-xs text-zinc-500 ml-1">— {style.description}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Growth Stages */}
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Growth Stages
            </h3>
            {GROWTH_STAGES.map((stage) => (
              <div key={stage.key} className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: stage.color }}
                />
                <span className="text-sm text-zinc-200">{stage.label}</span>
                <span className="text-xs text-zinc-500">({stage.scale})</span>
              </div>
            ))}
          </div>

          {/* Interactions */}
          <div className="mt-4 pt-3 border-t border-zinc-800 space-y-1">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Interactions
            </h3>
            <p className="text-xs text-zinc-500">
              Click a building to visit its project page
            </p>
            <p className="text-xs text-zinc-500">
              Hover to see project name and decision count
            </p>
            <p className="text-xs text-zinc-500">
              Glowing lots are reserved for future projects
            </p>
          </div>
        </div>
      )}
    </div>
  );
}