# Projects Community — Architecture Overview

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, React 19, RSC) |
| Language | TypeScript 5 |
| Database | SQLite via `better-sqlite3` |
| ORM | Drizzle ORM (SQLite dialect) |
| Styling | Tailwind CSS 4 |
| AI SDK | Vercel AI SDK (`ai` package) with OpenAI / Anthropic providers |
| Migrations | `drizzle-kit` (generate + push) |
| Testing | Vitest |

## Data Model (12 tables)

All tables live in `src/db/schema.ts`.

1. **owners** — Reserved for future multi-user support. MVP uses a single default owner.
2. **projects** — Top-level research containers. Has `background`, `summary`, `buildingStyle` (workshop / data-center / studio / community-hall), `growthStage`, and `visibility`.
3. **decisions** — Core unit of work. A `question` with a `state` (researching → deferred → decided → archived) and `scope` (independent / project / global). Can optionally link to a project.
4. **decision_links** — Explicit many-to-many join between decisions and projects (in addition to `decisions.projectId`).
5. **participants** — Reserved for future collaboration.
6. **candidates** — Options under consideration within a decision. Has `name` and auto-maintained `currentFormSummary`.
7. **conversations** — AI chat threads contextualized to a project, decision, or candidate (`contextType` + `contextId`).
8. **messages** — Individual chat messages within a conversation. `role` (user / assistant), `content`, optional `sourceLinks`.
9. **pins** — Bookmarked messages used for context assembly during AI chats.
10. **recommendations** — AI-generated comparisons between candidates, produced on explicit compare request. Linked to a decision + candidate with `reasoning`.
11. **adoption_snapshots** — Immutable records of adopted candidates. Has `isCurrent`, `supersededById` (self-referential FK for replacement tracking), `candidateSummary`, `reasoning`, and `adoptedAt`.
12. **research_jobs** — Background research tasks spawned from conversations. Status lifecycle: pending → running → completed → failed.

## Route Structure

| Route | Purpose |
|-------|---------|
| `/` | Landing page — overview of the three pillars (Projects, Decisions, Community Map) |
| `/projects` | List all projects with creation form |
| `/projects/[id]` | Project detail — background, linked decisions, new decision form |
| `/decisions` | List all decisions with state-filter tabs (researching / decided / deferred / archived) |
| `/decisions/[id]` | Decision detail — candidates, adoption state, state change form, chat/compare links |
| `/decisions/[id]/chat` | AI Realizer chat interface — streaming conversation with the AI |
| `/decisions/[id]/compare` | Side-by-side candidate comparison with AI recommendation |
| `/map` | Community Map — isometric canvas rendering of all projects as buildings |

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/chat` | POST | AI Realizer streaming endpoint |
| `/api/health` | GET | Health check |

## AI Realizer Flow

```
User sends message
       ↓
POST /api/chat (decisionId, candidateId?, messages[])
       ↓
1. Fetch decision + candidates from DB
2. Assemble context: conversation history, pinned messages, recent messages
3. Build system prompt from decision question + candidates
4. Append scope context if candidate-scoped
5. Append pinned message context
6. Save user message to DB
7. Call getAIModel() → Vercel AI SDK model (OpenAI or Anthropic via AI_PROVIDER)
8. streamText() with system prompt + conversation history
9. Stream response to client via toDataStreamResponse()
10. On finish: save assistant message to DB, trigger summary refresh every 5 messages
```

The AI provider is configured via environment variables:
- `AI_PROVIDER=openai` → uses `OPENAI_API_KEY` and `OPENAI_MODEL` (default: gpt-4o-mini)
- `AI_PROVIDER=anthropic` → uses `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`
- See `src/lib/ai/provider.ts`

## Community Map

The Community Map (`/map`) renders an isometric 3D town grid on an HTML5 Canvas.

- **Isometric projection**: Cartesian (gridX, gridY) → isometric screen coordinates via standard 30° transform.
- **Buildings**: Each project is a building drawn with 4 distinct styles:
  - **Workshop** (amber/orange) — gabled roof with chimney
  - **Data Center** (cyan) — tall tower with antenna
  - **Studio** (purple) — wide, low building with glass facade
  - **Community Hall** (green) — square building with columns and peaked roof
- **Growth stages**: Buildings scale from 0.4× (seedling) to 1.0× (mature) based on adoption count:
  - 0 adoptions → fallback to DB `growthStage`
  - 1–4 → sprouting (0.6×)
  - 5–9 → growing (0.8×)
  - 10+ → mature (1.0×)
- **Decision pins**: Small markers float above buildings for each decided decision.
- **Empty lots**: Glowing "Coming soon" placeholders fill up to 8 grid slots.
- **Interaction**: Hover highlights buildings, click navigates to project detail.

## Decision Lifecycle

```
researching ──→ deferred ──→ researching  (re-open)
     │                            ↑
     ├──→ decided ──→ archived   (or back to researching for re-evaluation)
     │                 │
     │                 └──→ researching (un-archive)
     └──→ archived
```

Each state:
- **researching** — Active investigation. AI chat and comparison are available.
- **deferred** — Paused. Can be moved back to researching.
- **decided** — A candidate has been adopted. An adoption snapshot exists with `isCurrent=true`.
- **archived** — Retired. No longer visible in default decision list.

### Adoption Transaction (`adoptCandidateAction`)

The adoption is a single Drizzle transaction for atomicity:

1. Fetch the candidate and decision
2. Locate any current adoption snapshot for this decision
3. Create a new `adoption_snapshots` row with `isCurrent=true`
4. If a previous current adoption exists: set `isCurrent=false` and `supersededById` pointing to the new snapshot
5. Set decision state to `decided`
6. If the decision belongs to a project, recalculate `growthStage` based on the count of decided decisions:
   - 1 decided → seedling
   - 3 decided → growing
   - 6 decided → thriving
   - 10 decided → mature
7. Revalidate affected paths (`/decisions`, `/projects`, `/map`)

This means a project's building grows taller on the Community Map as more of its decisions are resolved — creating a visual progression of research maturity.

## Key Library Modules (`src/lib/`)

| Module | Purpose |
|--------|---------|
| `ai/provider.ts` | AI model factory — reads `AI_PROVIDER` env var, returns OpenAI or Anthropic model |
| `ai/context-assembler.ts` | Gathers conversation history, pinned messages, and scope context for AI prompts |
| `ai/comparer.ts` | Generates structured candidate comparisons |
| `ai/summarizer.ts` | Auto-generates decision/candidate summaries from chat history |
| `system-prompt.ts` | Builds the AI system prompt with decision context and candidate details |
| `research/executor.ts` | Background research job executor |
| `validators.ts` | Zod validation schemas |

## Database

- **Library**: `better-sqlite3` — synchronous, embedded SQLite for local-first operation
- **ORM**: Drizzle ORM with SQLite dialect
- **Schema**: Defined in `src/db/schema.ts`, migrations managed by `drizzle-kit`
- **Seeding**: `npm run db:demo-seed` populates demo data via `src/db/demo-seed.ts`
- **Bootstrap**: `npm run db:seed` runs `src/db/bootstrap.ts` for initial setup
