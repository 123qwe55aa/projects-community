import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
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