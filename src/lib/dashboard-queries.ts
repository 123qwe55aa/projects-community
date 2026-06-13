import { eq, desc, sql, count, and } from 'drizzle-orm';
import { getDatabase } from '@/db';
import * as s from '@/db/schema';

// ────────────────────────────────────────────────────────────────────────────
// Dashboard Queries
// ────────────────────────────────────────────────────────────────────────────

export type DashboardData = {
  project: {
    id: string;
    background: string | null;
    summary: string | null;
    buildingStyle: string | null;
    growthStage: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  };
  stats: {
    totalDecisions: number;
    decisionsByState: { state: string; count: number }[];
    adoptionSnapshotCount: number;
    candidateCount: number;
    recentActivity: Date | null;
  };
  timeline: TimelineEvent[];
};

export type TimelineEvent = {
  id: string;
  type: 'project_created' | 'decision_created' | 'adoption_created';
  date: Date;
  summary: string;
  link?: string;
};

export async function getDashboardData(projectId: string): Promise<DashboardData | null> {
  const { db } = getDatabase();

  const project = await db.select().from(s.projects)
    .where(eq(s.projects.id, projectId))
    .then(r => r[0] ?? null);

  if (!project) return null;

  // ── Decisions linked to this project ─────────────────────────────────────
  const linkedDecisions = await db
    .select({
      id: s.decisions.id,
      question: s.decisions.question,
      state: s.decisions.state,
      createdAt: s.decisions.createdAt,
      updatedAt: s.decisions.updatedAt,
    })
    .from(s.decisionLinks)
    .innerJoin(s.decisions, eq(s.decisionLinks.decisionId, s.decisions.id))
    .where(eq(s.decisionLinks.projectId, projectId))
    .orderBy(desc(s.decisions.createdAt));

  // Also get decisions directly linked via projectId (not via decision_links)
  const directDecisions = await db
    .select({
      id: s.decisions.id,
      question: s.decisions.question,
      state: s.decisions.state,
      createdAt: s.decisions.createdAt,
      updatedAt: s.decisions.updatedAt,
    })
    .from(s.decisions)
    .where(eq(s.decisions.projectId, projectId))
    .orderBy(desc(s.decisions.createdAt));

  // Merge and deduplicate decisions
  const decisionMap = new Map<string, typeof linkedDecisions[number]>();
  for (const d of linkedDecisions) decisionMap.set(d.id, d);
  for (const d of directDecisions) {
    if (!decisionMap.has(d.id)) decisionMap.set(d.id, d);
  }
  const allDecisions = [...decisionMap.values()];

  // ── Adoption snapshots for this project ──────────────────────────────────
  const snapshots = await db
    .select({
      id: s.adoptionSnapshots.id,
      decisionId: s.adoptionSnapshots.decisionId,
      candidateId: s.adoptionSnapshots.candidateId,
      candidateSummary: s.adoptionSnapshots.candidateSummary,
      adoptedAt: s.adoptionSnapshots.adoptedAt,
    })
    .from(s.adoptionSnapshots)
    .where(eq(s.adoptionSnapshots.projectId, projectId))
    .orderBy(desc(s.adoptionSnapshots.adoptedAt));

  // ── Candidates count (via decisions linked to project) ──────────────────
  const decisionIds = allDecisions.map(d => d.id);
  let candidateCount = 0;
  if (decisionIds.length > 0) {
    const result = await db
      .select({ cnt: count() })
      .from(s.candidates)
      .where(
        sql`${s.candidates.decisionId} IN (${sql.join(decisionIds.map(id => sql`${id}`), sql`, `)})`
      );
    candidateCount = result[0]?.cnt ?? 0;
  }

  // ── Statistics ───────────────────────────────────────────────────────────
  const decisionsByState: { state: string; count: number }[] = [];
  const stateCountMap = new Map<string, number>();
  for (const d of allDecisions) {
    stateCountMap.set(d.state, (stateCountMap.get(d.state) ?? 0) + 1);
  }
  for (const [state, cnt] of stateCountMap) {
    decisionsByState.push({ state, count: cnt });
  }

  // Recent activity: most recent among project updatedAt, decisions updatedAt/CreatedAt, snapshots adoptedAt
  const recentDates: Date[] = [];
  if (project.updatedAt) recentDates.push(project.updatedAt);
  for (const d of allDecisions) {
    if (d.createdAt) recentDates.push(d.createdAt);
    if (d.updatedAt) recentDates.push(d.updatedAt);
  }
  for (const s of snapshots) {
    if (s.adoptedAt) recentDates.push(s.adoptedAt);
  }
  const recentActivity = recentDates.length > 0
    ? new Date(Math.max(...recentDates.map(d => new Date(d).getTime())))
    : null;

  // ── Timeline ─────────────────────────────────────────────────────────────
  const timeline: TimelineEvent[] = [];

  // Project creation event
  if (project.createdAt) {
    timeline.push({
      id: `project-${project.id}`,
      type: 'project_created',
      date: project.createdAt,
      summary: 'Project created',
      link: `/projects/${project.id}`,
    });
  }

  // Decision creation events
  for (const d of allDecisions) {
    if (d.createdAt) {
      timeline.push({
        id: `decision-${d.id}`,
        type: 'decision_created',
        date: d.createdAt,
        summary: `Decision: ${d.question}`,
        link: `/decisions/${d.id}`,
      });
    }
  }

  // Adoption snapshot events
  for (const snap of snapshots) {
    if (snap.adoptedAt) {
      timeline.push({
        id: `adoption-${snap.id}`,
        type: 'adoption_created',
        date: snap.adoptedAt,
        summary: `Adopted: ${snap.candidateSummary || snap.candidateId}`,
        link: `/decisions/${snap.decisionId}`,
      });
    }
  }

  // Sort timeline by date descending
  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    project: {
      id: project.id,
      background: project.background,
      summary: project.summary,
      buildingStyle: project.buildingStyle,
      growthStage: project.growthStage,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    stats: {
      totalDecisions: allDecisions.length,
      decisionsByState,
      adoptionSnapshotCount: snapshots.length,
      candidateCount,
      recentActivity,
    },
    timeline,
  };
}
