import { eq, and, desc, sql, count } from 'drizzle-orm';
import { getDatabase, type DB } from './index';
import * as s from './schema';
import {
  getDecision,
  getCandidate,
  listCandidates as listCandidatesHelper,
  getCurrentAdoption,
} from './helpers';

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────
function db(): DB {
  return getDatabase().db;
}

// ──────────────────────────────────────────────────
// getProjectWithDecisions
// Project + all linked decisions + candidates count per decision
// ──────────────────────────────────────────────────

export type ProjectWithDecisions = {
  project: Awaited<ReturnType<typeof import('./helpers').getProject>>;
  decisions: (Awaited<ReturnType<typeof import('./helpers').getDecision>> & {
    candidatesCount: number;
  })[];
};

export async function getProjectWithDecisions(projectId: string): Promise<ProjectWithDecisions | null> {
  const { db: database } = getDatabase();

  const project = await database.select().from(s.projects)
    .where(eq(s.projects.id, projectId))
    .then(r => r[0] ?? null);

  if (!project) return null;

  // Get decisions linked via projectId OR via decision_links
  const linkedDecisions = await database
    .select({
      id: s.decisions.id,
      ownerId: s.decisions.ownerId,
      question: s.decisions.question,
      state: s.decisions.state,
      scope: s.decisions.scope,
      dimensions: s.decisions.dimensions,
      weights: s.decisions.weights,
      projectId: s.decisions.projectId,
      visibility: s.decisions.visibility,
      createdAt: s.decisions.createdAt,
      updatedAt: s.decisions.updatedAt,
    })
    .from(s.decisions)
    .leftJoin(s.decisionLinks, eq(s.decisions.id, s.decisionLinks.decisionId))
    .where(
      sql`(${s.decisions.projectId} = ${projectId} OR ${s.decisionLinks.projectId} = ${projectId})`
    )
    .groupBy(s.decisions.id)
    .orderBy(desc(s.decisions.createdAt));

  // Get candidates count per decision
  const decisionsWithCount = await Promise.all(
    linkedDecisions.map(async (decision) => {
      const [{ count }] = await database
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(s.candidates)
        .where(eq(s.candidates.decisionId, decision.id));
      return { ...decision, candidatesCount: count };
    })
  );

  return { project, decisions: decisionsWithCount };
}

// ──────────────────────────────────────────────────
// getDecisionWithCandidates
// Decision + all candidates + current adoption snapshot
// ──────────────────────────────────────────────────

export type DecisionWithCandidates = {
  decision: NonNullable<Awaited<ReturnType<typeof getDecision>>>;
  candidates: Awaited<ReturnType<typeof listCandidatesHelper>>;
  currentAdoption: Awaited<ReturnType<typeof getCurrentAdoption>>;
};

export async function getDecisionWithCandidates(decisionId: string): Promise<DecisionWithCandidates | null> {
  const decision = await getDecision(decisionId);
  if (!decision) return null;

  const [candidates, currentAdoption] = await Promise.all([
    listCandidatesHelper(decisionId),
    getCurrentAdoption(decisionId),
  ]);

  return { decision, candidates, currentAdoption };
}

// ──────────────────────────────────────────────────
// getDecisionTimeline
// All messages + research jobs related to a decision's conversations
// ──────────────────────────────────────────────────

export type DecisionTimeline = {
  decision: NonNullable<Awaited<ReturnType<typeof getDecision>>>;
  conversations: {
    id: string;
    contextType: string;
    contextId: string;
    messages: Awaited<ReturnType<typeof import('./helpers').listMessages>>;
    researchJobs: Awaited<ReturnType<typeof import('./helpers').listResearchJobs>>;
  }[];
};

export async function getDecisionTimeline(decisionId: string): Promise<DecisionTimeline | null> {
  const database = db();
  const decision = await getDecision(decisionId);
  if (!decision) return null;

  // All conversations for this decision (including candidate-linked ones)
  // First, get candidate IDs for this decision
  const candidateRows = await database.select({ id: s.candidates.id })
    .from(s.candidates)
    .where(eq(s.candidates.decisionId, decisionId));

  const candidateIds = candidateRows.map(c => c.id);

  // Get conversations for decision context + all candidate contexts
  const conversationRows = await database.select().from(s.conversations).where(
    sql`(${s.conversations.contextType} = 'decision' AND ${s.conversations.contextId} = ${decisionId})
        OR (${s.conversations.contextType} = 'candidate' AND ${s.conversations.contextId} IN (${candidateIds.length > 0 ? sql.join(candidateIds.map(id => sql`${id}`), sql`, `) : sql`''`}))`
  ).orderBy(desc(s.conversations.createdAt));

  // For each conversation, load messages and research jobs
  const conversations = await Promise.all(
    conversationRows.map(async (conv) => {
      const [messages, researchJobs] = await Promise.all([
        database.select().from(s.messages)
          .where(eq(s.messages.conversationId, conv.id))
          .orderBy(s.messages.createdAt),
        database.select().from(s.researchJobs)
          .where(eq(s.researchJobs.conversationId, conv.id))
          .orderBy(desc(s.researchJobs.createdAt)),
      ]);
      return {
        id: conv.id,
        contextType: conv.contextType,
        contextId: conv.contextId,
        messages,
        researchJobs,
      };
    })
  );

  return { decision, conversations };
}

// ──────────────────────────────────────────────────
// getMapData
// Projects + adoption counts + decision markers for the community map
// ──────────────────────────────────────────────────

export type MapProjectData = {
  id: string;
  summary: string | null;
  background: string | null;
  buildingStyle: string | null;
  growthStage: string | null;
  decisionCount: number;
  adoptionCount: number; // drives dynamic building scale
};

export type MapDecisionMarker = {
  decisionId: string;
  projectId: string | null;
  question: string;
  adoptedAt: Date | null;
};

export async function getMapData(): Promise<{
  projects: MapProjectData[];
  decisionMarkers: MapDecisionMarker[];
}> {
  const database = db();

  // All projects
  const allProjects = await database.select().from(s.projects).orderBy(s.projects.createdAt);

  // Decision counts per project (via decision_links)
  const decisionCountRows = await database
    .select({
      projectId: s.decisionLinks.projectId,
      cnt: count(),
    })
    .from(s.decisionLinks)
    .groupBy(s.decisionLinks.projectId);

  const decisionCountMap = new Map(decisionCountRows.map((r) => [r.projectId, r.cnt]));

  // Adoption snapshot counts per project
  const adoptionCountRows = await database
    .select({
      projectId: s.adoptionSnapshots.projectId,
      cnt: count(),
    })
    .from(s.adoptionSnapshots)
    .groupBy(s.adoptionSnapshots.projectId);

  const adoptionCountMap = new Map(
    adoptionCountRows
      .filter((r) => r.projectId !== null)
      .map((r) => [r.projectId as string, r.cnt])
  );

  const projects: MapProjectData[] = allProjects.map((p) => ({
    id: p.id,
    summary: p.summary,
    background: p.background,
    buildingStyle: p.buildingStyle,
    growthStage: p.growthStage,
    decisionCount: decisionCountMap.get(p.id) ?? 0,
    adoptionCount: adoptionCountMap.get(p.id) ?? 0,
  }));

  // Decision markers: decisions that have at least one adoption snapshot
  const adoptedDecisionRows = await database
    .select({
      decisionId: s.adoptionSnapshots.decisionId,
      projectId: s.adoptionSnapshots.projectId,
      adoptedAt: s.adoptionSnapshots.adoptedAt,
      question: s.decisions.question,
    })
    .from(s.adoptionSnapshots)
    .innerJoin(s.decisions, eq(s.adoptionSnapshots.decisionId, s.decisions.id))
    .where(eq(s.adoptionSnapshots.isCurrent, true))
    .orderBy(desc(s.adoptionSnapshots.adoptedAt));

  const decisionMarkers: MapDecisionMarker[] = adoptedDecisionRows.map((r) => ({
    decisionId: r.decisionId,
    projectId: r.projectId,
    question: r.question,
    adoptedAt: r.adoptedAt,
  }));

  return { projects, decisionMarkers };
}