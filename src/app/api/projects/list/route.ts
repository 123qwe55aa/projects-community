import { NextResponse } from 'next/server';
import { getDatabase } from '@/db';
import { projects, decisionLinks, projectSnapshots, observations } from '@/db/schema';
import { count, eq } from 'drizzle-orm';

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

  // Observation counts per project — best-effort
  let obsCountMap = new Map<string, number>();
  try {
    const obsCounts = await db
      .select({
        projectId: observations.proposedProjectId,
        count: count(),
      })
      .from(observations)
      .groupBy(observations.proposedProjectId);

    obsCountMap = new Map(
      obsCounts
        .filter((r) => r.projectId !== null)
        .map((r) => [r.projectId!, r.count]),
    );
  } catch {
    // observations table may not exist or be empty
  }

  // Current snapshots — best-effort
  let snapshotMap = new Map<string, typeof projectSnapshots.$inferSelect>();
  try {
    const snapshots = await db
      .select()
      .from(projectSnapshots)
      .where(eq(projectSnapshots.isCurrent, true));
    snapshotMap = new Map(snapshots.map((s) => [s.projectId, s]));
  } catch {
    // project_snapshots table may not have rows yet
  }

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
      imageUrl: project.imageUrl ?? null,
      deployUrl: project.deployUrl ?? null,
      lifecycleState: snapshot?.lifecycleState ?? null,
      lifecycleRationale: snapshot?.lifecycleRationale ?? null,
    };
  });

  return NextResponse.json({ projects: items });
}
