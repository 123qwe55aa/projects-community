import { getDatabase } from '@/db';
import { projects, decisionLinks } from '@/db/schema';
import { count } from 'drizzle-orm';
import { CommunityMap } from './community-map';
import { MapLegend } from './map-legend';

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
};

export default async function MapPage() {
  const { db } = getDatabase();

  const allProjects = await db.select().from(projects).orderBy(projects.createdAt);

  // Get decision counts per project
  const decisionCounts = await db
    .select({
      projectId: decisionLinks.projectId,
      count: count(),
    })
    .from(decisionLinks)
    .groupBy(decisionLinks.projectId);

  const countMap = new Map(decisionCounts.map((r) => [r.projectId, r.count]));

  const mapProjects: MapProject[] = allProjects.map((p) => ({
    id: p.id,
    summary: p.summary,
    background: p.background,
    buildingStyle: p.buildingStyle,
    growthStage: p.growthStage,
    decisionCount: countMap.get(p.id) ?? 0,
  }));

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
        <CommunityMap projects={mapProjects} />
      </div>
    </div>
  );
}