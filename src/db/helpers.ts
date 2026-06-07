import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDatabase, type DB } from './index';
import * as s from './schema';

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────
function db(): DB {
  return getDatabase().db;
}

function nano(): string {
  return nanoid();
}

function now(): Date {
  return new Date();
}

// ──────────────────────────────────────────────────
// Projects
// ──────────────────────────────────────────────────

export async function createProject(input: {
  ownerId?: string;
  background?: string | null;
  summary?: string | null;
  buildingStyle?: string | null;
  growthStage?: string | null;
  visibility?: string;
}) {
  const [row] = await db().insert(s.projects).values({
    id: nano(),
    ownerId: input.ownerId ?? 'default',
    background: input.background ?? null,
    summary: input.summary ?? null,
    buildingStyle: input.buildingStyle ?? null,
    growthStage: input.growthStage ?? null,
    visibility: input.visibility ?? 'private',
    createdAt: now(),
    updatedAt: now(),
  }).returning();
  return row;
}

export async function getProject(id: string) {
  const [row] = await db().select().from(s.projects).where(eq(s.projects.id, id));
  return row ?? null;
}

export async function updateProject(id: string, input: {
  background?: string | null;
  summary?: string | null;
  buildingStyle?: string | null;
  growthStage?: string | null;
  visibility?: string;
}) {
  const [row] = await db().update(s.projects).set({
    ...input,
    updatedAt: now(),
  }).where(eq(s.projects.id, id)).returning();
  return row ?? null;
}

export async function listProjects(options?: { ownerId?: string }) {
  let query = db().select().from(s.projects).$dynamic();
  if (options?.ownerId) {
    query = query.where(eq(s.projects.ownerId, options.ownerId));
  }
  return query.orderBy(desc(s.projects.createdAt));
}

export async function deleteProject(id: string) {
  await db().delete(s.projects).where(eq(s.projects.id, id));
}

// ──────────────────────────────────────────────────
// Decisions
// ──────────────────────────────────────────────────

export async function createDecision(input: {
  ownerId?: string;
  question: string;
  state?: string;
  scope?: string;
  dimensions?: unknown;
  weights?: unknown;
  projectId?: string | null;
  visibility?: string;
}) {
  const [row] = await db().insert(s.decisions).values({
    id: nano(),
    ownerId: input.ownerId ?? 'default',
    question: input.question,
    state: input.state ?? 'researching',
    scope: input.scope ?? 'independent',
    dimensions: input.dimensions ? JSON.stringify(input.dimensions) : null,
    weights: input.weights ? JSON.stringify(input.weights) : null,
    projectId: input.projectId ?? null,
    visibility: input.visibility ?? 'private',
    createdAt: now(),
    updatedAt: now(),
  }).returning();
  return row;
}

export async function getDecision(id: string) {
  const [row] = await db().select().from(s.decisions).where(eq(s.decisions.id, id));
  return row ?? null;
}

export async function updateDecisionState(id: string, state: string) {
  const [row] = await db().update(s.decisions).set({
    state,
    updatedAt: now(),
  }).where(eq(s.decisions.id, id)).returning();
  return row ?? null;
}

export async function listDecisions(options?: { projectId?: string; ownerId?: string }) {
  const conditions = [];
  if (options?.projectId) conditions.push(eq(s.decisions.projectId, options.projectId));
  if (options?.ownerId) conditions.push(eq(s.decisions.ownerId, options.ownerId));

  let query = db().select().from(s.decisions).$dynamic();
  if (conditions.length === 1) {
    query = query.where(conditions[0]);
  } else if (conditions.length > 1) {
    query = query.where(and(...conditions));
  }
  return query.orderBy(desc(s.decisions.createdAt));
}

export async function deleteDecision(id: string) {
  await db().delete(s.decisions).where(eq(s.decisions.id, id));
}

// ──────────────────────────────────────────────────
// Candidates
// ──────────────────────────────────────────────────

export async function createCandidate(input: {
  decisionId: string;
  name: string;
  currentFormSummary?: string | null;
}) {
  const [row] = await db().insert(s.candidates).values({
    id: nano(),
    decisionId: input.decisionId,
    name: input.name,
    currentFormSummary: input.currentFormSummary ?? null,
    createdAt: now(),
    updatedAt: now(),
  }).returning();
  return row;
}

export async function getCandidate(id: string) {
  const [row] = await db().select().from(s.candidates).where(eq(s.candidates.id, id));
  return row ?? null;
}

export async function updateCandidate(id: string, input: {
  name?: string;
  currentFormSummary?: string | null;
}) {
  const [row] = await db().update(s.candidates).set({
    ...input,
    updatedAt: now(),
  }).where(eq(s.candidates.id, id)).returning();
  return row ?? null;
}

export async function listCandidates(decisionId: string) {
  return db().select().from(s.candidates)
    .where(eq(s.candidates.decisionId, decisionId))
    .orderBy(desc(s.candidates.createdAt));
}

export async function deleteCandidate(id: string) {
  await db().delete(s.candidates).where(eq(s.candidates.id, id));
}

// ──────────────────────────────────────────────────
// Conversations
// ──────────────────────────────────────────────────

export async function createConversation(input: {
  contextType: string;
  contextId: string;
}) {
  const [row] = await db().insert(s.conversations).values({
    id: nano(),
    contextType: input.contextType,
    contextId: input.contextId,
    createdAt: now(),
  }).returning();
  return row;
}

export async function getConversation(id: string) {
  const [row] = await db().select().from(s.conversations).where(eq(s.conversations.id, id));
  return row ?? null;
}

export async function listConversations(contextType: string, contextId: string) {
  return db().select().from(s.conversations).where(
    and(
      eq(s.conversations.contextType, contextType),
      eq(s.conversations.contextId, contextId),
    ),
  ).orderBy(desc(s.conversations.createdAt));
}

// ──────────────────────────────────────────────────
// Messages
// ──────────────────────────────────────────────────

export async function createMessage(input: {
  conversationId: string;
  role: string;
  content: string;
  sourceLinks?: unknown;
}) {
  const [row] = await db().insert(s.messages).values({
    id: nano(),
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    sourceLinks: input.sourceLinks ? JSON.stringify(input.sourceLinks) : null,
    createdAt: now(),
  }).returning();
  return row;
}

export async function listMessages(conversationId: string) {
  return db().select().from(s.messages)
    .where(eq(s.messages.conversationId, conversationId))
    .orderBy(s.messages.createdAt);
}

// ──────────────────────────────────────────────────
// Recommendations
// ──────────────────────────────────────────────────

export async function createRecommendation(input: {
  decisionId: string;
  candidateId: string;
  reasoning: string;
  sourceLinks?: unknown;
}) {
  // Supersede previous current recommendations for this decision
  await db().update(s.recommendations).set({ isCurrent: false })
    .where(eq(s.recommendations.decisionId, input.decisionId));

  const [row] = await db().insert(s.recommendations).values({
    id: nano(),
    decisionId: input.decisionId,
    candidateId: input.candidateId,
    reasoning: input.reasoning,
    sourceLinks: input.sourceLinks ? JSON.stringify(input.sourceLinks) : null,
    isCurrent: true,
    createdAt: now(),
  }).returning();
  return row;
}

export async function listRecommendations(decisionId: string) {
  return db().select().from(s.recommendations)
    .where(eq(s.recommendations.decisionId, decisionId))
    .orderBy(desc(s.recommendations.createdAt));
}

// ──────────────────────────────────────────────────
// Adoption Snapshots
// ──────────────────────────────────────────────────

export async function createAdoptionSnapshot(input: {
  decisionId: string;
  candidateId: string;
  projectId?: string | null;
  candidateSummary: string;
  reasoning: string;
}) {
  // Supersede the previous current adoption for this decision
  const current = await getCurrentAdoption(input.decisionId);
  const supersededById = current?.id ?? null;

  // Mark previous as superseded
  if (current) {
    await db().update(s.adoptionSnapshots).set({
      isCurrent: false,
      supersededById: input.candidateId,
    }).where(eq(s.adoptionSnapshots.id, current.id));
  }

  const [row] = await db().insert(s.adoptionSnapshots).values({
    id: nano(),
    decisionId: input.decisionId,
    candidateId: input.candidateId,
    projectId: input.projectId ?? null,
    candidateSummary: input.candidateSummary,
    reasoning: input.reasoning,
    isCurrent: true,
    supersededById: null,
    adoptedAt: now(),
  }).returning();
  return row;
}

export async function getCurrentAdoption(decisionId: string) {
  const [row] = await db().select().from(s.adoptionSnapshots).where(
    and(
      eq(s.adoptionSnapshots.decisionId, decisionId),
      eq(s.adoptionSnapshots.isCurrent, true),
    ),
  );
  return row ?? null;
}

export async function supersedeAdoption(adoptionId: string, newCandidateId: string, input: {
  candidateSummary: string;
  reasoning: string;
  projectId?: string | null;
}) {
  const oldAdoption = await db().select().from(s.adoptionSnapshots)
    .where(eq(s.adoptionSnapshots.id, adoptionId))
    .then(r => r[0]);
  if (!oldAdoption) return null;

  // Mark old as superseded
  await db().update(s.adoptionSnapshots).set({
    isCurrent: false,
    supersededById: newCandidateId,
  }).where(eq(s.adoptionSnapshots.id, adoptionId));

  // Create new adoption snapshot
  const [row] = await db().insert(s.adoptionSnapshots).values({
    id: nano(),
    decisionId: oldAdoption.decisionId,
    candidateId: newCandidateId,
    projectId: input.projectId ?? oldAdoption.projectId,
    candidateSummary: input.candidateSummary,
    reasoning: input.reasoning,
    isCurrent: true,
    supersededById: null,
    adoptedAt: now(),
  }).returning();
  return row;
}

// ──────────────────────────────────────────────────
// Research Jobs
// ──────────────────────────────────────────────────

export async function createResearchJob(input: {
  conversationId: string;
  query: string;
}) {
  const [row] = await db().insert(s.researchJobs).values({
    id: nano(),
    conversationId: input.conversationId,
    status: 'pending',
    query: input.query,
    createdAt: now(),
  }).returning();
  return row;
}

export async function updateResearchJobStatus(id: string, input: {
  status: string;
  results?: unknown;
  error?: string | null;
}) {
  const completedAt = ['completed', 'failed'].includes(input.status) ? now() : undefined;
  const [row] = await db().update(s.researchJobs).set({
    status: input.status,
    results: input.results ? JSON.stringify(input.results) : undefined,
    error: input.error ?? undefined,
    ...(completedAt ? { completedAt } : {}),
  }).where(eq(s.researchJobs.id, id)).returning();
  return row ?? null;
}

export async function listResearchJobs(conversationId: string) {
  return db().select().from(s.researchJobs)
    .where(eq(s.researchJobs.conversationId, conversationId))
    .orderBy(desc(s.researchJobs.createdAt));
}