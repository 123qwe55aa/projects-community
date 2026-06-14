# Projects Community Architecture

## System Shape

Projects Community V2 is a local-first, Hermes-first project observatory. Hermes is the primary
input and interpretation layer. Projects Community validates and stores Hermes writes, derives
current Project state from immutable history, and presents that state through an evidence-backed
Dashboard.

```text
Hermes conversation
  -> Projects Community stdio MCP server
  -> ingestion service
  -> SQLite event store
  -> projection engine
  -> Dashboard read models
  -> user governance corrections
  -> projection engine
```

The system stores concise structured records, short source quotes, and Hermes references. It does
not copy full Hermes conversations.

## Event Store

The V2 source of truth lives in `src/db/schema.ts`:

- `observations`: immutable facts captured from Hermes, including source quote, conversation and
  message references, assignment confidence, and an idempotency key.
- `project_events`: immutable statements about meaningful Project changes.
- `event_evidence`: atomic links from Project Events to supporting Observations.
- `corrections`: append-only user governance records; original observations and events are retained.
- `project_hypotheses` and `hypothesis_evidence`: emerging Project possibilities backed by repeated
  evidence.
- `ingestion_receipts`: durable idempotency receipts for Hermes tool calls.
- `project_snapshots`: versioned, rebuildable current-state projections.
- `projection_checkpoints`: projection rebuild status.

Hermes writes carry idempotency keys. The ingestion service stores the write and its receipt in one
transaction, so retries return the prior result instead of creating duplicate records. Event
evidence links are written in the same transaction as their event.

## Ingestion Service

`src/lib/v2/ingestion.ts` is the write boundary for Hermes:

- validates strict contracts from `src/lib/v2/contracts.ts`;
- records Observations and Project Events;
- automatically attaches only recognized, high-confidence Project assignments;
- leaves low-confidence or unassigned Observations for review;
- upserts repeated-evidence Project Hypotheses;
- rejects cross-tool idempotency-key reuse.

Hermes cannot directly overwrite a Project snapshot, promote a hypothesis, merge Projects, or
archive Projects. Those are user governance actions.

## Projection Engine

`src/lib/v2/projection/project.ts` folds immutable Project Events and later user Corrections into
the current Project snapshot. A snapshot contains the current summary, lifecycle state and
rationale, active themes, obstacles, unresolved questions, recent changes, and source event
boundary.

User lifecycle Corrections take precedence over earlier automatic inference. The projection is
deterministic and can be rebuilt from history with:

```bash
npm run v2:rebuild
```

`src/db/v2-migrate.ts` imports existing V1 Projects into V2 event history without deleting the V1
rows:

```bash
npm run v2:migrate
```

## Hermes MCP Flow

`src/mcp/projects-community.ts` exposes the local stdio MCP tools used by Hermes. A typical
high-confidence flow is:

1. Hermes records an Observation with a short quote, source references, and idempotency key.
2. The ingestion service validates the proposed Project and assignment confidence.
3. A high-confidence Observation is atomically attached through an immutable Project Event.
4. Hermes records a meaningful Project Event using the Observation as evidence.
5. The projection engine derives the current Project state for Dashboard reads.

An uncertain Observation stops after step 1 and appears in **Needs Attention**. The user can assign
or ignore it through append-only governance. See `docs/HERMES_SETUP.md` for local configuration.

## Dashboard Read Models

`src/lib/v2/queries.ts` builds read models over event history and projections:

- **Current Projects** reads current `project_snapshots`.
- **Needs Attention** finds Observations with no accepted attachment or terminal review Correction.
- **Recent Changes** joins Project Events to evidence and short source quotes.
- **Project Hypotheses** counts repeated evidence and shows recent source quotes.
- **Project detail** combines the current snapshot, evidence timeline, related Projects and Signals,
  and governance controls.

Server Actions in `src/app/v2-actions.ts` call `src/lib/v2/governance.ts` for assignment,
correction, merge, archive, Decision-suggestion review, and hypothesis promotion. Promotion creates
a formal Project and preserves hypothesis evidence on its timeline.

## V1 Compatibility Boundary

V2 adds an event-first observatory without deleting the V1 relational model.

- Existing `projects` rows remain the stable identity shared by V1 and V2.
- Existing Decisions, Candidates, conversations, recommendations, adoption snapshots, and the
  Community Map remain readable and usable as optional structures.
- The in-app AI Realizer and `/api/chat` remain a V1-compatible optional input path.
- V2 migration appends `legacy_imported` events and rebuildable snapshots; it does not remove V1
  records.
- Community Map redesign and V1 feature deletion are outside the V2 boundary.

## Runtime And Testing

| Layer | Technology |
|---|---|
| Web | Next.js App Router, React, Server Actions |
| Language | TypeScript |
| Database | SQLite via `better-sqlite3` and Drizzle ORM |
| Hermes integration | Model Context Protocol stdio server |
| Projection | Deterministic TypeScript event fold |
| Unit and integration tests | Vitest |
| Full browser journey | Playwright |

The deterministic V2 Playwright journey seeds records through the real ingestion service and never
depends on a live model call.
