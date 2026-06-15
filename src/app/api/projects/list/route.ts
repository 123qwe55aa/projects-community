import { NextResponse } from 'next/server';
import { getDatabase } from '@/db';
import { projects, decisionLinks } from '@/db/schema';
import { count } from 'drizzle-orm';

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

  const styleLabels: Record<string, string> = {
    workshop: '🔨 Workshop',
    'data-center': '📊 Data Center',
    studio: '🎨 Studio',
    'community-hall': '🏛️ Community Hall',
  };

  const items = allProjects.map((project) => ({
    id: project.id,
    summary: project.summary || project.background || 'Untitled Project',
    background: project.background && project.background !== project.summary ? project.background : null,
    buildingStyle: styleLabels[project.buildingStyle ?? ''] || project.buildingStyle,
    growthStage: project.growthStage || 'seed',
    decisionCount: countMap.get(project.id) ?? 0,
  }));

  return NextResponse.json({ projects: items });
}
