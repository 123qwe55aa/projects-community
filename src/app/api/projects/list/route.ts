import { NextResponse } from 'next/server';
import { getDatabase } from '@/db';
import { projects, decisionLinks, projectSnapshots, observations } from '@/db/schema';
import { count, eq, and, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { db } = getDatabase();

  const allProjects = await db.select().from(projects).orderBy(projects.createdAt);

  const decisionCounts = await db
    .select({
      projectId: decisionLinks.projectId,
      count: count(),
    })
    .from(decisionLinks)
    .groupBy(decisionLinks.projectId);

  const countMap = new Map(decisionCounts.map((r) => [r.projectId, r.count]));

  // Fetch current snapshots for all projects
  const snapshots = await db
    .select()
    .from(projectSnapshots)
    .where(eq(projectSnapshots.isCurrent, true));

  const snapshotMap = new Map(snapshots.map((s) => [s.projectId, s]));

  // Count observations per project
  const obsCounts = await db
    .select({
      projectId: observations.proposedProjectId,
      count: count(),
    })
    .from(observations)
    .groupBy(observations.proposedProjectId);

  const obsCountMap = new Map(
    obsCounts
      .filter((r) => r.projectId !== null)
      .map((r) => [r.projectId!, r.count]),
  );

  const styleLabels: Record<string, string> = {
    workshop: '🔨 Workshop',
    'data-center': '📊 Data Center',
    studio: '🎨 Studio',
    'community-hall': '🏛️ Community Hall',
  };

  const items = allProjects.map((project) => {
    const snapshot = snapshotMap.get(project.id);
    return {
      id: project.id,
      summary: project.summary || project.background || 'Untitled Project',
      background:
        project.background && project.background !== project.summary
          ? project.background
          : null,
      buildingStyle:
        styleLabels[project.buildingStyle ?? ''] || project.buildingStyle,
      growthStage: project.growthStage || 'seed',
      decisionCount: countMap.get(project.id) ?? 0,
      observationCount: obsCountMap.get(project.id) ?? 0,
      createdAt: project.createdAt,
      lifecycleState: snapshot?.lifecycleState ?? null,
      lifecycleRationale: snapshot?.lifecycleRationale ?? null,
      obstacles: snapshot?.obstacles ?? null,
      recentChanges: snapshot?.recentChanges ?? null,
      activeThemes: snapshot?.activeThemes ?? null,
    };
  });

  return NextResponse.json({ projects: items });
}
