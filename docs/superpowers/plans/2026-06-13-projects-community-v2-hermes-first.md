# Projects Community V2 Hermes-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Projects Community into a Hermes-first, event-driven project observatory with traceable observations, rebuildable project projections, lightweight governance, and a current-state dashboard.

**Architecture:** Hermes writes structured records through a local stdio MCP server backed by a shared ingestion service. Immutable observations, project events, evidence links, corrections, and hypothesis evidence form the source of truth; projection services build current Project snapshots and dashboard read models. The existing Next.js application becomes the observational and governance surface while V1 Decision data remains available.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, SQLite, better-sqlite3, Drizzle ORM, Zod, Model Context Protocol TypeScript SDK, Vitest, Playwright

---

## Scope And Delivery Order

This plan delivers one connected V2 loop:

```text
Hermes MCP write
  -> idempotent ingestion
  -> immutable event history
  -> rebuildable Project projection
  -> Dashboard display
  -> user correction/governance
  -> updated projection
```

Do not redesign the Community Map or remove V1 Decision pages during this plan.
Those are explicitly outside the V2 MVP.

## File Structure

### Shared Contracts And Ingestion

- Create `src/lib/v2/contracts.ts`: Zod schemas and shared V2 types.
- Create `src/lib/v2/ingestion.ts`: idempotent transactional Hermes writes.
- Create `src/lib/v2/governance.ts`: user confirmation, correction, merge, archive, and hypothesis promotion.
- Create `src/lib/v2/migration.ts`: idempotent V1 `legacy_imported` event creation.

### Event Store And Projection

- Modify `src/db/schema.ts`: V2 event-store and projection tables.
- Modify `src/db/index.ts`: configurable database path and test cleanup.
- Create `src/lib/v2/projection/project.ts`: rebuild one Project snapshot from event history.
- Create `src/lib/v2/projection/rebuild.ts`: rebuild all Project projections and checkpoint status.
- Create `src/lib/v2/queries.ts`: Dashboard, attention, hypothesis, and timeline read queries.

### Hermes MCP

- Create `src/mcp/projects-community.ts`: stdio MCP server exposing Hermes tools.
- Create `integrations/hermes/projects-community/SKILL.md`: Hermes capture-policy instructions.
- Modify `package.json`: MCP SDK dependency and MCP/test scripts.
- Create `docs/HERMES_SETUP.md`: exact Hermes configuration and verification.

### Dashboard And Governance UI

- Modify `src/app/page.tsx`: Current Projects, Needs Attention, and Recent Changes dashboard.
- Create `src/app/attention/page.tsx`: review queue.
- Create `src/app/hypotheses/page.tsx`: emerging Project hypotheses.
- Create `src/app/v2-actions.ts`: thin Server Action adapters over governance services.
- Create `src/components/v2/CurrentProjects.tsx`: current-state Project cards.
- Create `src/components/v2/NeedsAttention.tsx`: pending Observation cards.
- Create `src/components/v2/RecentChanges.tsx`: event stream.
- Create `src/components/v2/HypothesisCard.tsx`: evidence-backed hypothesis card.
- Create `src/components/v2/ProjectGovernance.tsx`: lifecycle correction, merge, and archive controls.
- Modify `src/app/projects/[id]/page.tsx`: current snapshot and evidence timeline.
- Modify `src/components/NavBar.tsx`: dashboard-oriented navigation.

### Tests

- Create `vitest.config.ts`: Node test configuration.
- Create `src/test/db.ts`: isolated temporary SQLite setup.
- Create `src/lib/v2/contracts.test.ts`
- Create `src/lib/v2/ingestion.test.ts`
- Create `src/lib/v2/projection/project.test.ts`
- Create `src/lib/v2/governance.test.ts`
- Create `src/lib/v2/migration.test.ts`
- Create `src/mcp/projects-community.test.ts`
- Create `e2e/v2-dashboard.spec.ts`

---

### Task 1: Add An Isolated Unit-Test Database Harness

**Files:**
- Modify: `package.json`
- Modify: `src/db/index.ts`
- Create: `vitest.config.ts`
- Create: `src/test/db.ts`
- Test: `src/test/db.test.ts`

- [ ] **Step 1: Add the failing database-isolation test**

Create `src/test/db.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { projects } from '@/db/schema';
import { closeDatabase } from '@/db';
import { createTestDatabase } from '@/test/db';

afterEach(() => closeDatabase());

describe('createTestDatabase', () => {
  it('creates an isolated migrated database', async () => {
    const testDb = createTestDatabase();
    await testDb.db.insert(projects).values({ id: 'project-1', summary: 'One' });

    const rows = await testDb.db.select().from(projects);
    expect(rows.map((row) => row.id)).toEqual(['project-1']);
  });
});
```

- [ ] **Step 2: Add test scripts and Vitest configuration**

Add these scripts to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test",
"mcp": "tsx src/mcp/projects-community.ts"
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    sequence: { concurrent: false },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

- [ ] **Step 3: Make the database path configurable and closable**

Modify `src/db/index.ts` so path resolution happens when the connection opens:

```ts
function databasePath() {
  return process.env.PROJECTS_COMMUNITY_DB_PATH
    ? join(process.env.PROJECTS_COMMUNITY_DB_PATH)
    : join(process.cwd(), 'data', 'projects-community.db');
}

export function closeDatabase() {
  _sqlite?.close();
  _sqlite = null;
  _db = null;
}
```

Update `getDatabase()` to derive `DB_DIR` from `databasePath()` with
`dirname(databasePath())` instead of module-level constants.

- [ ] **Step 4: Implement the temporary database helper**

Create `src/test/db.ts`:

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, getDatabase } from '@/db';
import { initDatabase } from '@/db/migrate';

export function createTestDatabase() {
  closeDatabase();
  const directory = mkdtempSync(join(tmpdir(), 'projects-community-'));
  process.env.PROJECTS_COMMUNITY_DB_PATH = join(directory, 'test.db');
  const migrated = initDatabase();
  migrated.sqlite.close();
  return getDatabase();
}
```

Update `src/db/migrate.ts` to use the same `PROJECTS_COMMUNITY_DB_PATH`
resolution as `src/db/index.ts`.

- [ ] **Step 5: Run the isolated test**

Run:

```bash
npm test -- src/test/db.test.ts
```

Expected: one passing test and no writes to `data/projects-community.db`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/db/index.ts src/db/migrate.ts src/test
git commit -m "test: add isolated sqlite harness"
```

---

### Task 2: Add The V2 Event-Store Schema And Migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: generated `drizzle/0001_*.sql`
- Test: `src/lib/v2/schema.test.ts`

- [ ] **Step 1: Write the failing schema test**

Create `src/lib/v2/schema.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase } from '@/db';
import { observations, projectEvents, projectSnapshots, projects } from '@/db/schema';
import { createTestDatabase } from '@/test/db';

afterEach(() => closeDatabase());

describe('V2 schema', () => {
  it('stores observations, events, and snapshots', async () => {
    const { db } = createTestDatabase();
    await db.insert(projects).values({ id: 'project-1', summary: 'One' });
    await db.insert(observations).values({
      id: 'obs-1',
      idempotencyKey: 'hermes:message-1:observation-1',
      summary: 'Started exploring a Hermes-first dashboard',
      type: 'project_signal',
      sourceConversationRef: 'hermes:conversation-1',
      sourceMessageRef: 'hermes:message-1',
      sourceQuote: 'I want Hermes as the entry point',
      observedAt: new Date(),
      recordedAt: new Date(),
      actor: 'hermes',
      schemaVersion: 1,
    });
    await db.insert(projectEvents).values({
      id: 'event-1',
      projectId: 'project-1',
      eventType: 'progress_recorded',
      payload: JSON.stringify({ summary: 'Hermes-first direction selected' }),
      actor: 'hermes',
      occurredAt: new Date(),
      createdAt: new Date(),
      schemaVersion: 1,
    });
    await db.insert(projectSnapshots).values({
      id: 'snapshot-1',
      projectId: 'project-1',
      summary: 'Hermes-first direction selected',
      lifecycleState: 'active',
      activeThemes: '[]',
      obstacles: '[]',
      unresolvedQuestions: '[]',
      recentChanges: '[]',
      sourceEventId: 'event-1',
      projectionVersion: 1,
      isCurrent: true,
      createdAt: new Date(),
    });

    expect(await db.select().from(observations)).toHaveLength(1);
    expect(await db.select().from(projectEvents)).toHaveLength(1);
    expect(await db.select().from(projectSnapshots)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Add V2 tables to `src/db/schema.ts`**

Add:

```ts
import { uniqueIndex } from 'drizzle-orm/sqlite-core';

export const observations = sqliteTable('observations', {
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
}, (table) => [
  uniqueIndex('observations_idempotency_key_unique').on(table.idempotencyKey),
]);

export const projectEvents = sqliteTable('project_events', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id).notNull(),
  eventType: text('event_type').notNull(),
  payload: text('payload').notNull(),
  rationale: text('rationale'),
  actor: text('actor').notNull(),
  idempotencyKey: text('idempotency_key'),
  occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  schemaVersion: integer('schema_version').notNull(),
}, (table) => [
  uniqueIndex('project_events_idempotency_key_unique').on(table.idempotencyKey),
]);

export const eventEvidence = sqliteTable('event_evidence', {
  id: text('id').primaryKey(),
  eventId: text('event_id').references(() => projectEvents.id).notNull(),
  observationId: text('observation_id').references(() => observations.id).notNull(),
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
  projectId: text('project_id').references(() => projects.id).notNull(),
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

export const signals = sqliteTable('signals', {
  id: text('id').primaryKey(),
  stableKey: text('stable_key').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
  uniqueIndex('signals_stable_key_unique').on(table.stableKey),
]);

export const signalEvidence = sqliteTable('signal_evidence', {
  id: text('id').primaryKey(),
  signalId: text('signal_id').references(() => signals.id).notNull(),
  observationId: text('observation_id').references(() => observations.id).notNull(),
});

export const projectHypotheses = sqliteTable('project_hypotheses', {
  id: text('id').primaryKey(),
  stableKey: text('stable_key').notNull(),
  title: text('title').notNull(),
  explanation: text('explanation').notNull(),
  state: text('state').notNull(),
  firstSeenAt: integer('first_seen_at', { mode: 'timestamp' }).notNull(),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }).notNull(),
  promotedProjectId: text('promoted_project_id').references(() => projects.id),
}, (table) => [
  uniqueIndex('project_hypotheses_stable_key_unique').on(table.stableKey),
]);

export const hypothesisEvidence = sqliteTable('hypothesis_evidence', {
  id: text('id').primaryKey(),
  hypothesisId: text('hypothesis_id').references(() => projectHypotheses.id).notNull(),
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
```

- [ ] **Step 3: Generate and run the migration**

Run:

```bash
npm run db:generate
npm test -- src/lib/v2/schema.test.ts
```

Expected: a new `drizzle/0001_*.sql` migration and one passing schema test.

- [ ] **Step 4: Verify V1 tables remain present**

Run:

```bash
npm run db:seed
npm run build
```

Expected: migration succeeds, existing seed remains readable, and Next.js build passes.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle src/lib/v2/schema.test.ts
git commit -m "feat: add V2 event store schema"
```

---

### Task 3: Define Shared Hermes Tool Contracts

**Files:**
- Create: `src/lib/v2/contracts.ts`
- Test: `src/lib/v2/contracts.test.ts`

- [ ] **Step 1: Write contract tests**

Create `src/lib/v2/contracts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { recordObservationInput, recordProjectEventInput } from './contracts';

describe('V2 contracts', () => {
  it('accepts an evidence-backed observation', () => {
    expect(recordObservationInput.parse({
      idempotencyKey: 'hermes:message-1:observation-1',
      summary: 'The project moved to a Hermes-first direction',
      type: 'project_signal',
      sourceConversationRef: 'hermes:conversation-1',
      sourceMessageRef: 'hermes:message-1',
      sourceQuote: 'Hermes should be the entry point',
      observedAt: '2026-06-13T10:00:00.000Z',
      proposedProjectId: 'project-1',
      assignmentConfidence: 95,
      assignmentRationale: 'The user named the existing project.',
    }).assignmentConfidence).toBe(95);
  });

  it('rejects events without evidence', () => {
    expect(() => recordProjectEventInput.parse({
      idempotencyKey: 'hermes:event-1',
      projectId: 'project-1',
      eventType: 'progress_recorded',
      payload: { summary: 'Progress' },
      evidenceObservationIds: [],
      rationale: 'No evidence',
      occurredAt: '2026-06-13T10:00:00.000Z',
    })).toThrow();
  });
});
```

- [ ] **Step 2: Implement complete Zod contracts**

Create `src/lib/v2/contracts.ts`:

```ts
import { z } from 'zod';

export const observationTypes = [
  'progress', 'idea', 'interest', 'obstacle', 'question', 'commitment',
  'decision_signal', 'project_signal', 'context', 'other',
] as const;

export const projectEventTypes = [
  'project_created', 'observation_attached', 'progress_recorded',
  'direction_changed', 'obstacle_identified', 'obstacle_resolved',
  'interest_increased', 'interest_decreased', 'lifecycle_inferred',
  'lifecycle_corrected', 'project_merged', 'project_archived',
  'hypothesis_promoted', 'legacy_imported', 'decision_suggested',
  'decision_confirmed',
] as const;

export const recordObservationInput = z.object({
  idempotencyKey: z.string().min(1).max(200),
  summary: z.string().min(1).max(1000),
  type: z.enum(observationTypes),
  sourceConversationRef: z.string().min(1).max(500),
  sourceMessageRef: z.string().min(1).max(500),
  sourceQuote: z.string().min(1).max(500),
  observedAt: z.string().datetime(),
  proposedProjectId: z.string().min(1).optional(),
  assignmentConfidence: z.number().int().min(0).max(100).optional(),
  assignmentRationale: z.string().min(1).max(1000).optional(),
}).superRefine((value, ctx) => {
  if (value.proposedProjectId && value.assignmentConfidence === undefined) {
    ctx.addIssue({ code: 'custom', message: 'assignmentConfidence is required with proposedProjectId' });
  }
});

export const recordProjectEventInput = z.object({
  idempotencyKey: z.string().min(1).max(200),
  projectId: z.string().min(1),
  eventType: z.enum(projectEventTypes),
  payload: z.record(z.unknown()),
  evidenceObservationIds: z.array(z.string().min(1)).min(1),
  rationale: z.string().min(1).max(1000),
  occurredAt: z.string().datetime(),
});

export const attachObservationToProjectInput = z.object({
  idempotencyKey: z.string().min(1).max(200),
  observationId: z.string().min(1),
  projectId: z.string().min(1),
  rationale: z.string().min(1).max(1000),
  occurredAt: z.string().datetime(),
});

export const upsertProjectHypothesisInput = z.object({
  stableKey: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  explanation: z.string().min(1).max(2000),
  observationIds: z.array(z.string().min(1)).min(1),
});

export const suggestDecisionInput = z.object({
  idempotencyKey: z.string().min(1).max(200),
  projectId: z.string().min(1),
  question: z.string().min(1).max(1000),
  evidenceObservationIds: z.array(z.string().min(1)).min(1),
  rationale: z.string().min(1).max(1000),
});

export type RecordObservationInput = z.infer<typeof recordObservationInput>;
export type RecordProjectEventInput = z.infer<typeof recordProjectEventInput>;
export type AttachObservationToProjectInput = z.infer<typeof attachObservationToProjectInput>;
export type UpsertProjectHypothesisInput = z.infer<typeof upsertProjectHypothesisInput>;
export type SuggestDecisionInput = z.infer<typeof suggestDecisionInput>;
```

- [ ] **Step 3: Run contract tests**

Run:

```bash
npm test -- src/lib/v2/contracts.test.ts
```

Expected: both tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/v2/contracts.ts src/lib/v2/contracts.test.ts
git commit -m "feat: define Hermes ingestion contracts"
```

---

### Task 4: Implement Idempotent Observation And Event Ingestion

**Files:**
- Create: `src/lib/v2/ingestion.ts`
- Test: `src/lib/v2/ingestion.test.ts`

- [ ] **Step 1: Write failing ingestion tests**

Create `src/lib/v2/ingestion.test.ts` with tests for:

```ts
it('deduplicates repeated observation writes by idempotency key', async () => {
  const first = await recordObservation(validObservation);
  const second = await recordObservation(validObservation);
  expect(second).toEqual({ ...first, deduplicated: true });
  expect(await db.select().from(observations)).toHaveLength(1);
});

it('auto-attaches only observations at or above the confidence threshold', async () => {
  const accepted = await recordObservation({ ...validObservation, proposedProjectId: 'project-1', assignmentConfidence: 90 });
  const pending = await recordObservation({ ...validObservation, idempotencyKey: 'obs-2', proposedProjectId: 'project-1', assignmentConfidence: 60 });
  expect(accepted.reviewStatus).toBe('accepted');
  expect(pending.reviewStatus).toBe('pending');
});

it('records an event and all evidence atomically', async () => {
  await expect(recordProjectEvent({ ...validEvent, evidenceObservationIds: ['missing'] })).rejects.toThrow('Observation not found');
  expect(await db.select().from(projectEvents)).toHaveLength(0);
});
```

Use `beforeEach(createTestDatabase)` and seed `project-1` plus the required
Observation rows explicitly in each test.

- [ ] **Step 2: Implement ingestion services**

Create `src/lib/v2/ingestion.ts` exporting:

```ts
export const AUTO_ASSIGN_CONFIDENCE = 85;

export async function recordObservation(raw: RecordObservationInput): Promise<{
  observationId: string;
  reviewStatus: 'accepted' | 'pending';
  attachedProjectId: string | null;
  deduplicated: boolean;
}>;

export async function recordProjectEvent(raw: RecordProjectEventInput): Promise<{
  eventId: string;
  deduplicated: boolean;
}>;

export async function attachObservationToProject(raw: AttachObservationToProjectInput): Promise<{
  eventId: string;
  deduplicated: boolean;
}>;

export async function upsertProjectHypothesis(raw: UpsertProjectHypothesisInput): Promise<{
  hypothesisId: string;
  created: boolean;
}>;

export async function suggestDecision(raw: SuggestDecisionInput): Promise<{
  eventId: string;
  deduplicated: boolean;
}>;
```

Implementation rules:

1. Parse with the contracts from Task 3.
2. Look up the idempotency key before starting new work.
3. Run each new write in one Drizzle transaction.
4. `recordObservation` inserts the Observation. At confidence `>= 85`, it also
   appends an `observation_attached` Project Event and evidence link.
5. Lower confidence leaves the Observation unassigned for `Needs Attention`.
6. `recordProjectEvent` verifies Project and every evidence Observation before
   inserting the Event and evidence links.
7. `attachObservationToProject` records an `observation_attached` event and
   evidence link; it never updates the immutable Observation row.
8. `upsertProjectHypothesis` updates title, explanation, and `lastSeenAt`, then
   inserts only missing evidence links.
9. `suggestDecision` records a `decision_suggested` event; it does not create a
   V1 Decision row.

- [ ] **Step 3: Run ingestion tests**

Run:

```bash
npm test -- src/lib/v2/ingestion.test.ts
```

Expected: deduplication, confidence boundary, atomic failure, hypothesis
upsert, and decision suggestion tests all pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/v2/ingestion.ts src/lib/v2/ingestion.test.ts
git commit -m "feat: add idempotent Hermes ingestion"
```

---

### Task 5: Build Rebuildable Project Projections

**Files:**
- Create: `src/lib/v2/projection/project.ts`
- Create: `src/lib/v2/projection/rebuild.ts`
- Test: `src/lib/v2/projection/project.test.ts`

- [ ] **Step 1: Write projection behavior tests**

Create `src/lib/v2/projection/project.test.ts` covering:

```ts
it('derives current summary and lifecycle from ordered events', async () => {
  await seedEvents([
    event('progress_recorded', { summary: 'Hermes MCP server started' }),
    event('obstacle_identified', { obstacle: 'Dashboard does not show evidence yet' }),
    event('lifecycle_inferred', { state: 'active', rationale: 'Recent explicit progress' }),
  ]);
  const snapshot = await projectProject('project-1');
  expect(snapshot.lifecycleState).toBe('active');
  expect(JSON.parse(snapshot.obstacles)).toEqual(['Dashboard does not show evidence yet']);
});

it('gives a user lifecycle correction precedence over earlier inference', async () => {
  await seedLifecycleInference('dormant');
  await seedCorrection('lifecycle_state', { state: 'active', rationale: 'Still actively designing' });
  expect((await projectProject('project-1')).lifecycleState).toBe('active');
});

it('rebuilds to the same current state', async () => {
  const before = await projectProject('project-1');
  await rebuildAllProjectProjections();
  const after = await getCurrentProjectSnapshot('project-1');
  expect(after?.summary).toBe(before.summary);
});
```

- [ ] **Step 2: Implement deterministic Project projection**

Create `src/lib/v2/projection/project.ts` with:

```ts
export const PROJECT_PROJECTION_VERSION = 1;

export async function projectProject(projectId: string) {
  // Load the Project, ordered Project Events, evidence Observations, and
  // Corrections. Reduce them deterministically into summary, lifecycle,
  // activeThemes, obstacles, unresolvedQuestions, and recentChanges.
  // Mark the previous current snapshot false, insert a new current snapshot,
  // and update projects.summary for V1 page compatibility in one transaction.
}

export async function getCurrentProjectSnapshot(projectId: string) {
  // Return the latest isCurrent snapshot or null.
}
```

Use these reduction rules:

- latest event payload `summary` becomes the current summary;
- `obstacle_identified` adds a unique obstacle;
- `obstacle_resolved` removes the matching obstacle;
- `question` evidence contributes unresolved questions;
- latest `lifecycle_inferred` supplies inferred state and rationale;
- latest user `lifecycle_state` Correction overrides earlier inference;
- five newest events become `recentChanges`;
- projection values are JSON arrays stored as text;
- no model call occurs during projection.

- [ ] **Step 3: Implement full rebuild and checkpoint**

Create `src/lib/v2/projection/rebuild.ts`:

```ts
export async function rebuildAllProjectProjections() {
  // Set checkpoint status=running.
  // Project every existing Project in createdAt order.
  // Set status=completed and lastEventId to the newest Project Event.
  // On error, persist status=failed and the error message, then rethrow.
}
```

- [ ] **Step 4: Run projection tests**

Run:

```bash
npm test -- src/lib/v2/projection/project.test.ts
```

Expected: lifecycle precedence, obstacle reduction, deterministic rebuild, and
failed-checkpoint tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/v2/projection
git commit -m "feat: add rebuildable project projections"
```

---

### Task 6: Expose The Real Hermes MCP Server

**Files:**
- Modify: `package.json`
- Create: `src/mcp/projects-community.ts`
- Create: `integrations/hermes/projects-community/SKILL.md`
- Create: `docs/HERMES_SETUP.md`
- Test: `src/mcp/projects-community.test.ts`

- [ ] **Step 1: Install the MCP SDK**

Run:

```bash
npm install @modelcontextprotocol/sdk
```

Expected: `package.json` and `package-lock.json` include the MCP SDK.

- [ ] **Step 2: Write an MCP registration test**

Create `src/mcp/projects-community.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createProjectsCommunityServer, toolNames } from './projects-community';

describe('Projects Community MCP', () => {
  it('registers the Hermes V2 write tools', () => {
    expect(createProjectsCommunityServer()).toBeDefined();
    expect(toolNames).toEqual([
      'record_observation',
      'attach_observation_to_project',
      'record_project_event',
      'upsert_project_hypothesis',
      'suggest_decision',
    ]);
  });
});
```

- [ ] **Step 3: Implement the stdio MCP server**

Create `src/mcp/projects-community.ts` following the local orchestration MCP
pattern:

```ts
#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  recordObservation,
  attachObservationToProject,
  recordProjectEvent,
  suggestDecision,
  upsertProjectHypothesis,
} from '@/lib/v2/ingestion';

export const toolNames = [
  'record_observation',
  'attach_observation_to_project',
  'record_project_event',
  'upsert_project_hypothesis',
  'suggest_decision',
] as const;

function jsonContent(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

export function createProjectsCommunityServer() {
  const server = new McpServer({ name: 'projects-community', version: '0.2.0' });
  // Register all five tools with the exact field constraints from contracts.ts.
  // Each handler calls only the matching ingestion function and returns jsonContent.
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createProjectsCommunityServer();
  await server.connect(new StdioServerTransport());
}
```

Do not log to stdout; stdout is reserved for MCP protocol messages.

- [ ] **Step 4: Document exact Hermes configuration**

Create `integrations/hermes/projects-community/SKILL.md` with the capture
policy Hermes must follow:

```markdown
---
name: projects-community
description: Record project-relevant conversation evidence into Projects Community.
---

# Projects Community Capture Policy

During normal conversation, use the Projects Community MCP tools when the user
states project progress, ideas, obstacles, commitments, project signals, or
clear lifecycle changes.

- Record concise structured summaries with only the necessary short quote.
- Use a stable idempotency key derived from the Hermes conversation, message,
  and extracted observation index.
- Auto-attach only when an existing Project is explicit and confidence is at
  least 85.
- Leave uncertain assignment pending for Dashboard review.
- Upsert a Project Hypothesis when a new theme repeats.
- Suggest Decisions only for clear consequential trade-offs.
- Never create a formal Project, merge, archive, or delete through MCP tools.
- Do not copy the complete conversation.
```

Create `docs/HERMES_SETUP.md` with:

```yaml
mcp_servers:
  projects-community:
    command: node
    args:
      - /Users/toby/Documents/Projects/projects-community/node_modules/tsx/dist/cli.mjs
      - /Users/toby/Documents/Projects/projects-community/src/mcp/projects-community.ts
    env:
      PROJECTS_COMMUNITY_DB_PATH: /Users/toby/Documents/Projects/projects-community/data/projects-community.db
    enabled: true
    timeout: 120
```

Also document:

1. run `npm install && npm run db:seed`;
2. add the server block to `~/.hermes/config.yaml`;
3. install the capture policy with
   `ln -s /Users/toby/Documents/Projects/projects-community/integrations/hermes/projects-community ~/.hermes/skills/projects-community`;
4. restart Hermes;
5. ask Hermes to record a clearly identified test Observation;
6. verify the Observation appears in SQLite and the Dashboard.

- [ ] **Step 5: Run MCP tests and a protocol smoke test**

Run:

```bash
npm test -- src/mcp/projects-community.test.ts
printf '' | npm run mcp
```

Expected: registration test passes; MCP process writes no non-protocol output
and exits cleanly when stdin closes.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/mcp integrations/hermes docs/HERMES_SETUP.md
git commit -m "feat: expose Hermes project recording MCP"
```

---

### Task 7: Add Dashboard And Timeline Read Queries

**Files:**
- Create: `src/lib/v2/queries.ts`
- Test: `src/lib/v2/queries.test.ts`

- [ ] **Step 1: Write read-model query tests**

Create `src/lib/v2/queries.test.ts` with fixtures that verify:

```ts
expect((await getDashboardData()).currentProjects[0]).toMatchObject({
  projectId: 'project-1',
  lifecycleState: 'active',
});
expect((await getNeedsAttention())).toHaveLength(1);
expect((await getRecentChanges())[0].eventType).toBe('progress_recorded');
expect((await getProjectTimeline('project-1'))[0].evidence[0].sourceQuote)
  .toBe('Hermes should be the entry point');
```

- [ ] **Step 2: Implement focused read queries**

Create `src/lib/v2/queries.ts` exporting:

```ts
export async function getDashboardData(): Promise<{
  currentProjects: CurrentProjectCard[];
  needsAttention: AttentionItem[];
  recentChanges: RecentChange[];
  hypotheses: ProjectHypothesisCard[];
}>;

export async function getNeedsAttention(): Promise<AttentionItem[]>;
export async function getRecentChanges(limit?: number): Promise<RecentChange[]>;
export async function getProjectHypotheses(): Promise<ProjectHypothesisCard[]>;
export async function getProjectTimeline(projectId: string): Promise<ProjectTimelineItem[]>;
```

Query rules:

- `currentProjects` uses each Project's current snapshot;
- `needsAttention` contains Observations with no accepted attachment event and
  no confirm/ignore Correction;
- `recentChanges` orders Project Events by `occurredAt` descending;
- hypotheses include supporting evidence counts and the three latest short
  quotes;
- timeline joins Event evidence to Observation source references.

- [ ] **Step 3: Run query tests**

Run:

```bash
npm test -- src/lib/v2/queries.test.ts
```

Expected: all query shape and ordering tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/v2/queries.ts src/lib/v2/queries.test.ts
git commit -m "feat: add V2 dashboard read queries"
```

---

### Task 8: Replace The Landing Page With The Current-State Dashboard

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/NavBar.tsx`
- Create: `src/components/v2/CurrentProjects.tsx`
- Create: `src/components/v2/NeedsAttention.tsx`
- Create: `src/components/v2/RecentChanges.tsx`
- Modify: `e2e/home.spec.ts`

- [ ] **Step 1: Update the failing home-page E2E expectations**

Replace the V1 title/description and three-card assertions in
`e2e/home.spec.ts` with:

```ts
test('shows the Hermes-first current-state dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Current Projects' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Needs Attention' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent Changes' })).toBeVisible();
  await expect(page.getByText('Hermes-first project observatory')).toBeVisible();
});
```

Update navigation assertions to expect Dashboard, Needs Attention, Hypotheses,
and Projects as primary links. Keep explicit smoke tests proving Decisions and
Community Map remain reachable as secondary links.

- [ ] **Step 2: Implement dashboard components**

Create server-compatible presentational components:

```ts
// src/components/v2/CurrentProjects.tsx
export function CurrentProjects({ projects }: { projects: CurrentProjectCard[] }) {
  // Render grouped active, dormant, ended, and archived Project cards.
  // Each card links to /projects/[id], shows summary, lifecycle rationale,
  // latest change, obstacles, and an evidence count.
}

// src/components/v2/NeedsAttention.tsx
export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  // Render at most five pending items with source quote and a link to /attention.
}

// src/components/v2/RecentChanges.tsx
export function RecentChanges({ changes }: { changes: RecentChange[] }) {
  // Render event type, Project, rationale, relative timestamp, and source quote.
}
```

Use existing dark zinc styling and no new component library.

- [ ] **Step 3: Replace `src/app/page.tsx`**

The page must:

```ts
import { getDashboardData } from '@/lib/v2/queries';

export default async function Home() {
  const data = await getDashboardData();
  return (
    <main>
      <header>
        <h1>Current Projects</h1>
        <p>Hermes-first project observatory</p>
      </header>
      <CurrentProjects projects={data.currentProjects} />
      <NeedsAttention items={data.needsAttention} />
      <RecentChanges changes={data.recentChanges} />
    </main>
  );
}
```

- [ ] **Step 4: Update primary navigation**

Change `src/components/NavBar.tsx` primary links to:

```ts
[
  { href: '/', label: 'Dashboard', icon: '◉' },
  { href: '/attention', label: 'Needs Attention', icon: '!' },
  { href: '/hypotheses', label: 'Hypotheses', icon: '◇' },
  { href: '/projects', label: 'Projects', icon: '▦' },
]
```

Keep Decisions and Community Map accessible as secondary links after the four
primary entries.

- [ ] **Step 5: Run build and home E2E**

Run:

```bash
npm run build
npm run test:e2e -- e2e/home.spec.ts
```

Expected: build passes and dashboard E2E passes.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/components/NavBar.tsx src/components/v2 e2e/home.spec.ts
git commit -m "feat: make current projects the V2 dashboard"
```

---

### Task 9: Implement Lightweight Governance And Needs Attention

**Files:**
- Create: `src/lib/v2/governance.ts`
- Create: `src/app/v2-actions.ts`
- Create: `src/app/attention/page.tsx`
- Test: `src/lib/v2/governance.test.ts`

- [ ] **Step 1: Write governance tests**

Create `src/lib/v2/governance.test.ts` covering:

```ts
it('confirms an Observation by appending a correction and attachment event', async () => {
  await confirmObservation({ observationId: 'obs-1', projectId: 'project-1' });
  expect(await getNeedsAttention()).toHaveLength(0);
  expect(await latestEvent()).toMatchObject({ eventType: 'observation_attached', actor: 'user' });
});

it('ignores an Observation without deleting it', async () => {
  await ignoreObservation('obs-1');
  expect(await db.select().from(observations)).toHaveLength(1);
  expect(await getNeedsAttention()).toHaveLength(0);
});

it('corrects lifecycle state through a correction and new projection', async () => {
  await correctLifecycle({ projectId: 'project-1', state: 'active', rationale: 'Still active' });
  expect((await getCurrentProjectSnapshot('project-1'))?.lifecycleState).toBe('active');
});

it('confirms a pending Decision suggestion exactly once', async () => {
  const decisionId = await confirmDecisionSuggestion('suggestion-event-1');
  expect(await getDecision(decisionId)).not.toBeNull();
  await expect(confirmDecisionSuggestion('suggestion-event-1')).resolves.toBe(decisionId);
  expect(await db.select().from(decisions)).toHaveLength(1);
});
```

- [ ] **Step 2: Implement governance service**

Create `src/lib/v2/governance.ts` exporting:

```ts
export async function confirmObservation(input: { observationId: string; projectId: string }): Promise<void>;
export async function ignoreObservation(observationId: string): Promise<void>;
export async function correctLifecycle(input: {
  projectId: string;
  state: 'active' | 'dormant' | 'ended' | 'archived';
  rationale: string;
}): Promise<void>;
export async function mergeProjects(input: { sourceProjectId: string; targetProjectId: string; rationale: string }): Promise<void>;
export async function archiveProject(input: { projectId: string; rationale: string }): Promise<void>;
export async function confirmDecisionSuggestion(eventId: string): Promise<string>;
export async function dismissDecisionSuggestion(eventId: string, rationale: string): Promise<void>;
```

Each function appends a `Correction` and required Project Event in one
transaction, then calls `projectProject()` for affected Projects. Merge and
archive preserve all source rows and never call V1 destructive delete actions.
Confirming a Decision suggestion creates one V1-compatible `decisions` row and
`decision_links` row, then appends `decision_confirmed`. Dismissal appends a
Correction and leaves no Decision row.

- [ ] **Step 3: Add thin Server Actions**

Create `src/app/v2-actions.ts` with `'use server'`. Parse `FormData`, call the
matching governance function, then revalidate `/`, `/attention`, `/projects`,
and affected Project paths. Server Actions contain no database logic.

- [ ] **Step 4: Build the Needs Attention page**

Create `src/app/attention/page.tsx` that:

- loads `getNeedsAttention()` and existing Projects;
- shows summary, short quote, Hermes source reference, proposed assignment,
  confidence, and rationale;
- offers Confirm, Reassign, and Ignore forms backed by `v2-actions.ts`;
- offers Confirm or Dismiss for pending Decision suggestions;
- displays an empty state when no items need review.

- [ ] **Step 5: Run tests and build**

Run:

```bash
npm test -- src/lib/v2/governance.test.ts
npm run build
```

Expected: governance tests and build pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/v2/governance.ts src/lib/v2/governance.test.ts src/app/v2-actions.ts src/app/attention
git commit -m "feat: add V2 observation governance"
```

---

### Task 10: Add Project Hypothesis Governance

**Files:**
- Modify: `src/lib/v2/governance.ts`
- Modify: `src/app/v2-actions.ts`
- Create: `src/app/hypotheses/page.tsx`
- Create: `src/components/v2/HypothesisCard.tsx`
- Test: `src/lib/v2/governance.test.ts`

- [ ] **Step 1: Add failing promotion and dismissal tests**

Add:

```ts
it('promotes a hypothesis into a formal Project while preserving evidence', async () => {
  const projectId = await promoteHypothesis('hypothesis-1');
  expect(await getProject(projectId)).not.toBeNull();
  expect(await getProjectTimeline(projectId)).not.toHaveLength(0);
});

it('dismisses a hypothesis without deleting evidence', async () => {
  await dismissHypothesis('hypothesis-1', 'Not a Project');
  expect((await getProjectHypotheses()).find((item) => item.id === 'hypothesis-1')).toBeUndefined();
  expect(await db.select().from(hypothesisEvidence)).not.toHaveLength(0);
});
```

- [ ] **Step 2: Implement hypothesis governance**

Add to `src/lib/v2/governance.ts`:

```ts
export async function promoteHypothesis(hypothesisId: string): Promise<string>;
export async function dismissHypothesis(hypothesisId: string, rationale: string): Promise<void>;
```

Promotion transaction:

1. verify hypothesis is `emerging`;
2. create a formal V1-compatible Project using title/explanation;
3. append `project_created` and `hypothesis_promoted` events;
4. connect all hypothesis Observation evidence to the promotion event;
5. set hypothesis state to `promoted` and `promotedProjectId`;
6. create the first Project projection.

Dismissal appends a Correction and sets the hypothesis projection state to
`dismissed`; it never deletes evidence.

- [ ] **Step 3: Build hypothesis UI**

Create `src/components/v2/HypothesisCard.tsx` and
`src/app/hypotheses/page.tsx`. Each card shows:

- title and explanation;
- first-seen and last-seen time;
- supporting evidence count;
- three latest short quotes with Hermes references;
- Promote and Dismiss actions.

Do not display probability or predicted start date.

- [ ] **Step 4: Run tests and build**

Run:

```bash
npm test -- src/lib/v2/governance.test.ts
npm run build
```

Expected: all governance tests pass and hypotheses page builds.

- [ ] **Step 5: Commit**

```bash
git add src/lib/v2/governance.ts src/lib/v2/governance.test.ts src/app/v2-actions.ts src/app/hypotheses src/components/v2/HypothesisCard.tsx
git commit -m "feat: add project hypothesis governance"
```

---

### Task 11: Make Project Detail Evidence-First

**Files:**
- Modify: `src/app/projects/[id]/page.tsx`
- Create: `src/components/v2/ProjectTimeline.tsx`
- Create: `src/components/v2/ProjectSnapshotPanel.tsx`
- Create: `src/components/v2/ProjectGovernance.tsx`
- Modify: `e2e/projects.spec.ts`

- [ ] **Step 1: Add failing Project-detail E2E expectations**

Add a V2-focused test to `e2e/projects.spec.ts`:

```ts
test('shows current snapshot and evidence timeline', async ({ page }) => {
  await page.goto('/projects');
  await page.locator('a[href^="/projects/"]').first().click();
  await expect(page.getByRole('heading', { name: 'Current State' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evidence Timeline' })).toBeVisible();
});
```

Replace the V1 destructive-delete test with an archive-governance test that
requires a rationale, preserves the Project detail route, and verifies the
current lifecycle state becomes `archived`.

- [ ] **Step 2: Implement evidence-first components**

Create:

```ts
export function ProjectSnapshotPanel({ snapshot }: { snapshot: ProjectSnapshotView | null }) {
  // Show lifecycle state and rationale, summary, active themes, obstacles,
  // unresolved questions, and latest changes.
}

export function ProjectTimeline({ items }: { items: ProjectTimelineItem[] }) {
  // Show event, rationale, evidence summary, short source quote, timestamp,
  // and Hermes sourceConversationRef/sourceMessageRef.
}

export function ProjectGovernance({ project, projects }: ProjectGovernanceProps) {
  // Provide forms backed by v2-actions.ts for lifecycle correction, merging
  // this Project into another Project, and archival with a required rationale.
}
```

- [ ] **Step 3: Refactor Project detail page**

Modify `src/app/projects/[id]/page.tsx` to load:

```ts
const [projectWithDecisions, snapshot, timeline] = await Promise.all([
  getProjectWithDecisions(id),
  getCurrentProjectSnapshot(id),
  getProjectTimeline(id),
]);
```

Render `ProjectSnapshotPanel` and `ProjectTimeline` first. Keep optional
Decisions and Adoption History below them. Remove New Decision and Delete
buttons from the primary header; render `ProjectGovernance` in their place.

- [ ] **Step 4: Run Project E2E and build**

Run:

```bash
npm run build
npm run test:e2e -- e2e/projects.spec.ts
```

Expected: current snapshot, evidence timeline, and existing optional Decision
sections remain accessible.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/projects/[id]/page.tsx' src/components/v2 e2e/projects.spec.ts
git commit -m "feat: make project details evidence-first"
```

---

### Task 12: Import Existing V1 Projects Into The Event Boundary

**Files:**
- Create: `src/lib/v2/migration.ts`
- Create: `src/db/v2-migrate.ts`
- Modify: `package.json`
- Test: `src/lib/v2/migration.test.ts`

- [ ] **Step 1: Write idempotent migration tests**

Create `src/lib/v2/migration.test.ts`:

```ts
it('creates one legacy_imported event and projection per V1 Project', async () => {
  await importV1Projects();
  await importV1Projects();
  expect(await eventsOfType('legacy_imported')).toHaveLength(1);
  expect(await getCurrentProjectSnapshot('project-1')).not.toBeNull();
});

it('does not modify V1 Decision data', async () => {
  const before = await db.select().from(decisions);
  await importV1Projects();
  expect(await db.select().from(decisions)).toEqual(before);
});
```

- [ ] **Step 2: Implement V1 import boundary**

Create `src/lib/v2/migration.ts`:

```ts
export async function importV1Projects() {
  // For every existing Project without idempotency key
  // `v2:legacy-import:<projectId>`, append one legacy_imported event using
  // the current background/summary as payload, then project the Project.
  // Never modify or delete V1 Decision-related rows.
}
```

Create `src/db/v2-migrate.ts` that initializes the database, calls
`importV1Projects()`, prints counts, and closes the connection.

Add:

```json
"v2:migrate": "tsx src/db/v2-migrate.ts",
"v2:rebuild": "tsx src/db/v2-rebuild.ts"
```

Create `src/db/v2-rebuild.ts` as a thin CLI wrapper around
`rebuildAllProjectProjections()`.

- [ ] **Step 3: Run migration twice and verify**

Run:

```bash
npm test -- src/lib/v2/migration.test.ts
npm run v2:migrate
npm run v2:migrate
npm run v2:rebuild
```

Expected: the second migration creates zero additional legacy events; rebuild
completes; V1 Decisions remain readable.

- [ ] **Step 4: Commit**

```bash
git add src/lib/v2/migration.ts src/lib/v2/migration.test.ts src/db/v2-migrate.ts src/db/v2-rebuild.ts package.json
git commit -m "feat: migrate V1 projects into V2 event history"
```

---

### Task 13: Verify The Complete Hermes-To-Dashboard Journey

**Files:**
- Create: `e2e/v2-dashboard.spec.ts`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `docs/HERMES_SETUP.md`

- [ ] **Step 1: Add a deterministic E2E fixture path**

In `e2e/v2-dashboard.spec.ts`, use an API/test fixture or direct imported
ingestion service in Playwright setup to create:

1. one high-confidence Observation assigned to an existing Project;
2. one low-confidence unassigned Observation;
3. one Project Hypothesis with repeated evidence.

Never depend on a live model call in E2E.

- [ ] **Step 2: Implement the complete V2 E2E test**

The test must verify:

```ts
test('supports the Hermes-first observation and governance journey', async ({ page }) => {
  // Dashboard shows high-confidence Project change.
  // Needs Attention shows uncertain Observation.
  // User assigns uncertain Observation to an existing Project.
  // Project timeline shows the appended correction and source quote.
  // Hypotheses page shows repeated theme evidence.
  // User promotes hypothesis.
  // New formal Project preserves its evidence timeline.
});
```

- [ ] **Step 3: Update user-facing documentation**

Update `README.md` to describe:

- Hermes as the primary input;
- Dashboard as the observation/governance surface;
- `npm run v2:migrate`;
- `npm run v2:rebuild`;
- link to `docs/HERMES_SETUP.md`;
- V1 Decisions as optional structures.

Update `ARCHITECTURE.md` with:

- event store;
- ingestion service;
- projection engine;
- Hermes MCP flow;
- Dashboard read models;
- V1 compatibility boundary.

- [ ] **Step 4: Configure Hermes locally and run the real smoke test**

Back up `~/.hermes/config.yaml`, add the `projects-community` MCP block from
`docs/HERMES_SETUP.md`, restart Hermes, then ask Hermes to record one clearly
identified test Observation.

Verify:

```bash
sqlite3 data/projects-community.db \
  "select summary, source_conversation_ref from observations order by recorded_at desc limit 1;"
```

Expected: the Hermes-written Observation appears once with its conversation
reference.

- [ ] **Step 5: Run the full verification suite**

Run:

```bash
npm test
npm run lint
npm run build
npm run test:e2e
git diff --check
```

Expected: all unit tests, lint, build, and E2E tests pass; no whitespace errors.

- [ ] **Step 6: Commit**

```bash
git add e2e/v2-dashboard.spec.ts README.md ARCHITECTURE.md docs/HERMES_SETUP.md
git commit -m "test: verify Hermes-first V2 journey"
```

---

## Final Verification Checklist

- [ ] Hermes can call the real local stdio MCP tools.
- [ ] Every Hermes write uses an idempotency key.
- [ ] Duplicate writes do not create duplicate records.
- [ ] High-confidence Observations attach automatically.
- [ ] Low-confidence Observations enter Needs Attention without changing a Project.
- [ ] Project Events and evidence links write atomically.
- [ ] Project current state is rebuilt from immutable event history.
- [ ] User Corrections override earlier automatic inference.
- [ ] Project Hypotheses accumulate evidence without probability or date predictions.
- [ ] Promotion creates a formal Project and preserves hypothesis evidence.
- [ ] Dashboard first shows Current Projects, Needs Attention, and Recent Changes.
- [ ] Project detail shows current state and evidence timeline.
- [ ] Full Hermes conversations are not copied into Projects Community.
- [ ] Existing V1 Project and optional Decision data remain readable.
- [ ] Community Map redesign and V1 feature deletion remain outside this plan.
- [ ] `npm test`, `npm run lint`, `npm run build`, and `npm run test:e2e` pass.

## Suggested Agent Boundaries

Use sequential implementation for Tasks 1-7 because schema, contracts,
ingestion, projection, MCP, and queries define shared contracts.

After Task 7:

- Task 8 dashboard UI and Task 10 hypothesis UI may run in parallel.
- Task 9 governance must land before Task 10 promotion behavior.
- Task 11 Project detail can run in parallel with Task 12 V1 migration.
- Task 13 integration verification runs only after all earlier tasks pass.

Require a spec-conformance and code-quality review after Tasks 6, 10, and 13.
