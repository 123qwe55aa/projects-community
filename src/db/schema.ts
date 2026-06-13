import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ──────────────────────────────────────────────────
// Owners (reserved for future multi-user; MVP = single default owner)
// ──────────────────────────────────────────────────
export const owners = sqliteTable('owners', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ──────────────────────────────────────────────────
// Projects
// ──────────────────────────────────────────────────
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').references(() => owners.id),
  background: text('background'), // project background & purpose
  summary: text('summary'), // auto-maintained summary
  buildingStyle: text('building_style'), // workshop | data-center | studio | community-hall
  growthStage: text('growth_stage'), // MVP: limited predefined stages
  visibility: text('visibility').default('private'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ──────────────────────────────────────────────────
// Decisions
// ──────────────────────────────────────────────────
export const decisions = sqliteTable('decisions', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').references(() => owners.id),
  question: text('question').notNull(), // the decision question
  state: text('state').notNull(), // researching | deferred | decided | archived
  scope: text('scope').notNull(), // independent | project | global
  dimensions: text('dimensions'), // JSON: comparison dimensions
  weights: text('weights'), // JSON: dimension weights
  projectId: text('project_id').references(() => projects.id), // null if independent
  visibility: text('visibility').default('private'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ──────────────────────────────────────────────────
// Decision Links (joins Decisions to Projects)
// ──────────────────────────────────────────────────
export const decisionLinks = sqliteTable('decision_links', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .references(() => projects.id)
    .notNull(),
  decisionId: text('decision_id')
    .references(() => decisions.id)
    .notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ──────────────────────────────────────────────────
// Participants (reserved for future collaboration)
// ──────────────────────────────────────────────────
export const participants = sqliteTable('participants', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id),
  decisionId: text('decision_id').references(() => decisions.id),
  role: text('role'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ──────────────────────────────────────────────────
// Candidates (options within a Decision)
// ──────────────────────────────────────────────────
export const candidates = sqliteTable('candidates', {
  id: text('id').primaryKey(),
  decisionId: text('decision_id')
    .references(() => decisions.id)
    .notNull(),
  name: text('name').notNull(),
  currentFormSummary: text('current_form_summary'), // auto-maintained
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ──────────────────────────────────────────────────
// Conversations (per project, decision, or candidate)
// ──────────────────────────────────────────────────
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  contextType: text('context_type').notNull(), // project | decision | candidate
  contextId: text('context_id').notNull(), // FK to project/decision/candidate
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ──────────────────────────────────────────────────
// Messages
// ──────────────────────────────────────────────────
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .references(() => conversations.id)
    .notNull(),
  role: text('role').notNull(), // user | assistant
  content: text('content').notNull(),
  sourceLinks: text('source_links'), // JSON array of source URLs
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ──────────────────────────────────────────────────
// Pins (bookmark messages for context assembly)
// ──────────────────────────────────────────────────
export const pins = sqliteTable('pins', {
  id: text('id').primaryKey(),
  messageId: text('message_id')
    .references(() => messages.id)
    .notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ──────────────────────────────────────────────────
// Recommendations (produced on explicit compare request)
// ──────────────────────────────────────────────────
export const recommendations = sqliteTable('recommendations', {
  id: text('id').primaryKey(),
  decisionId: text('decision_id')
    .references(() => decisions.id)
    .notNull(),
  candidateId: text('candidate_id')
    .references(() => candidates.id)
    .notNull(),
  reasoning: text('reasoning').notNull(), // comparison reasoning
  sourceLinks: text('source_links'), // JSON
  isCurrent: integer('is_current', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ──────────────────────────────────────────────────
// Adoption Snapshots (immutable decision records)
// ──────────────────────────────────────────────────
export const adoptionSnapshots = sqliteTable('adoption_snapshots', {
  id: text('id').primaryKey(),
  decisionId: text('decision_id')
    .references(() => decisions.id)
    .notNull(),
  candidateId: text('candidate_id')
    .references(() => candidates.id)
    .notNull(),
  projectId: text('project_id').references(() => projects.id),
  candidateSummary: text('candidate_summary').notNull(), // immutable snapshot
  reasoning: text('reasoning').notNull(),
  isCurrent: integer('is_current', { mode: 'boolean' }).default(true),
  supersededById: text('superseded_by_id'), // FK to self (another adoption_snapshot)
  adoptedAt: integer('adopted_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ──────────────────────────────────────────────────
// Research Jobs (background research tasks)
// ──────────────────────────────────────────────────
export const researchJobs = sqliteTable('research_jobs', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .references(() => conversations.id)
    .notNull(),
  status: text('status').notNull(), // pending | running | completed | failed
  query: text('query').notNull(),
  results: text('results'), // JSON
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

// ──────────────────────────────────────────────────
// V2 Event Store and Projections
// ──────────────────────────────────────────────────
export const observations = sqliteTable(
  'observations',
  {
    id: text('id').primaryKey(),
    idempotencyKey: text('idempotency_key').notNull(),
    summary: text('summary').notNull(),
    type: text('type').notNull(),
    sourceQuote: text('source_quote').notNull(),
    sourceConversationRef: text('source_conversation_ref').notNull(),
    sourceMessageRef: text('source_message_ref').notNull(),
    proposedProjectId: text('proposed_project_id').references(() => projects.id),
    assignmentConfidence: integer('assignment_confidence'),
    assignmentRationale: text('assignment_rationale'),
    observedAt: integer('observed_at', { mode: 'timestamp' }).notNull(),
    recordedAt: integer('recorded_at', { mode: 'timestamp' }).notNull(),
    actor: text('actor').notNull(),
    schemaVersion: integer('schema_version').notNull(),
  },
  (table) => [
    uniqueIndex('observations_idempotency_key_unique').on(table.idempotencyKey),
  ],
);

export const projectEvents = sqliteTable(
  'project_events',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .references(() => projects.id)
      .notNull(),
    eventType: text('event_type').notNull(),
    payload: text('payload').notNull(),
    rationale: text('rationale'),
    actor: text('actor').notNull(),
    idempotencyKey: text('idempotency_key'),
    occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    schemaVersion: integer('schema_version').notNull(),
  },
  (table) => [
    uniqueIndex('project_events_idempotency_key_unique').on(table.idempotencyKey),
  ],
);

export const eventEvidence = sqliteTable('event_evidence', {
  id: text('id').primaryKey(),
  eventId: text('event_id')
    .references(() => projectEvents.id)
    .notNull(),
  observationId: text('observation_id')
    .references(() => observations.id)
    .notNull(),
});

export const corrections = sqliteTable('corrections', {
  id: text('id').primaryKey(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  correctionType: text('correction_type').notNull(),
  payload: text('payload').notNull(),
  actor: text('actor').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const projectSnapshots = sqliteTable('project_snapshots', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .references(() => projects.id)
    .notNull(),
  summary: text('summary').notNull(),
  lifecycleState: text('lifecycle_state').notNull(),
  lifecycleRationale: text('lifecycle_rationale'),
  activeThemes: text('active_themes').notNull(),
  obstacles: text('obstacles').notNull(),
  unresolvedQuestions: text('unresolved_questions').notNull(),
  recentChanges: text('recent_changes').notNull(),
  sourceEventId: text('source_event_id').references(() => projectEvents.id),
  projectionVersion: integer('projection_version').notNull(),
  isCurrent: integer('is_current', { mode: 'boolean' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const signals = sqliteTable(
  'signals',
  {
    id: text('id').primaryKey(),
    stableKey: text('stable_key').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [uniqueIndex('signals_stable_key_unique').on(table.stableKey)],
);

export const signalEvidence = sqliteTable('signal_evidence', {
  id: text('id').primaryKey(),
  signalId: text('signal_id')
    .references(() => signals.id)
    .notNull(),
  observationId: text('observation_id')
    .references(() => observations.id)
    .notNull(),
});

export const projectHypotheses = sqliteTable(
  'project_hypotheses',
  {
    id: text('id').primaryKey(),
    stableKey: text('stable_key').notNull(),
    title: text('title').notNull(),
    explanation: text('explanation').notNull(),
    state: text('state').notNull(),
    firstSeenAt: integer('first_seen_at', { mode: 'timestamp' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }).notNull(),
    promotedProjectId: text('promoted_project_id').references(() => projects.id),
  },
  (table) => [
    uniqueIndex('project_hypotheses_stable_key_unique').on(table.stableKey),
  ],
);

export const hypothesisEvidence = sqliteTable('hypothesis_evidence', {
  id: text('id').primaryKey(),
  hypothesisId: text('hypothesis_id')
    .references(() => projectHypotheses.id)
    .notNull(),
  observationId: text('observation_id').references(() => observations.id),
  signalId: text('signal_id').references(() => signals.id),
});

export const projectionCheckpoints = sqliteTable('projection_checkpoints', {
  name: text('name').primaryKey(),
  lastEventId: text('last_event_id'),
  projectionVersion: integer('projection_version').notNull(),
  status: text('status').notNull(),
  error: text('error'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
