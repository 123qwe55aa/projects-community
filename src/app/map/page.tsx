import { Suspense } from 'react';
import Link from 'next/link';
import { getMapData } from '@/db/queries';
import { CommunityMap } from './community-map';
import { MapLegend } from './map-legend';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export const metadata = {
  title: 'Community Map',
};

export type MapProject = {
  id: string;
  summary: string | null;
  background: string | null;
  buildingStyle: string | null;
  growthStage: string | null;
  decisionCount: number;
  adoptionCount: number;
};

export type MapDecisionMarker = {
  decisionId: string;
  projectId: string | null;
  question: string;
  adoptedAt: Date | null;
};

function MapSkeleton() {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Shimmer canvas placeholder */}
      <div className="absolute inset-0 bg-zinc-950">
        <div className="absolute inset-0 overflow-hidden">
          <div className="animate-shimmer absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-zinc-800/20 to-transparent" />
        </div>
        {/* Skeleton buildings */}
        <div className="absolute inset-0 flex items-center justify-center gap-16">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-2 animate-pulse"
              style={{ animationDelay: `${i * 0.15}s` }}
            >
              <div
                className="bg-zinc-800 rounded-sm"
                style={{
                  width: `${40 + i * 10}px`,
                  height: `${50 + i * 15}px`,
                  opacity: 0.6,
                }}
              />
              <div className="h-2 w-16 bg-zinc-800 rounded" />
            </div>
          ))}
        </div>
        <p className="absolute bottom-8 left-1/2 -translate-x-1/2 text-sm text-zinc-600 animate-pulse">
          Loading community map…
        </p>
      </div>
    </div>
  );
}

async function MapContent() {
  const { projects: rawProjects, decisionMarkers } = await getMapData();

  const mapProjects: MapProject[] = rawProjects.map((p) => ({
    id: p.id,
    summary: p.summary,
    background: p.background,
    buildingStyle: p.buildingStyle,
    growthStage: p.growthStage,
    decisionCount: p.decisionCount,
    adoptionCount: p.adoptionCount,
  }));

  if (mapProjects.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-6xl">🌱</div>
          <h2 className="text-xl font-semibold text-white">Community is empty</h2>
          <p className="text-zinc-500 text-sm">
            Start a project to see it grow on the map. Each decision you resolve makes your building taller.
          </p>
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            + Start a Project
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <CommunityMap projects={mapProjects} decisionMarkers={decisionMarkers} />
    </ErrorBoundary>
  );
}

export default async function MapPage() {
  return (
    <div className="flex flex-1 flex-col h-full">
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold text-white">Community Map</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Your research neighborhood — watch it grow
          </p>
        </div>
        <MapLegend />
      </div>
      <div className="flex-1 min-h-0">
        <Suspense fallback={<MapSkeleton />}>
          <MapContent />
        </Suspense>
      </div>
    </div>
  );
}
