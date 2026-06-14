# Projects Community

Projects Community is a local-first, Hermes-first project observatory. Talk naturally with Hermes;
Hermes records concise, source-linked Observations and Project Events; the web Dashboard turns that
event history into a current view of Projects, recent changes, uncertain assignments, and emerging
Project hypotheses.

The Dashboard is the observation and governance surface, not the primary writing interface. Use it
to review evidence, assign uncertain Observations, correct inferred lifecycle state, and promote
repeated themes into formal Projects.

## Quick Start

```bash
git clone https://github.com/123qwe55aa/projects-community.git
cd projects-community
npm install
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To make Hermes the primary input, follow
[docs/HERMES_SETUP.md](docs/HERMES_SETUP.md).

## Hermes-First Flow

```text
Hermes conversation
  -> structured MCP tool call with idempotency key
  -> immutable Observation and Project Event
  -> rebuildable Project snapshot
  -> Dashboard review and governance
```

- High-confidence Observations can attach to an existing Project automatically.
- Uncertain Observations remain unchanged in **Needs Attention** until the user assigns or ignores
  them.
- Repeated evidence can form an emerging **Project Hypothesis**; only the user can promote it.
- Project detail pages preserve the evidence timeline, short source quote, and Hermes conversation
  reference.
- Full Hermes conversations are not copied into Projects Community.

## V2 Operations

Run the V1-to-V2 event-history migration:

```bash
npm run v2:migrate
```

Rebuild all current Project snapshots from immutable event history:

```bash
npm run v2:rebuild
```

Both commands use the local SQLite database at `data/projects-community.db` unless
`PROJECTS_COMMUNITY_DB_PATH` is set.

## V1 Compatibility

Existing V1 Projects remain readable. V1 Decisions, Candidate research, comparisons, adoption
snapshots, and the Community Map remain available as optional structures, but they are no longer the
primary interaction model.

The optional in-app AI Realizer still requires the provider variables in `.env.local`:

```env
OPENAI_API_KEY=sk-...
# Or:
ANTHROPIC_API_KEY=sk-ant-...
AI_PROVIDER=anthropic
```

Hermes-first ingestion itself does not call a live model inside Projects Community.

## Commands

```bash
npm test
npm run lint
npm run build
npm run test:e2e
npm run v2:migrate
npm run v2:rebuild
npm run mcp
```

## Tech Stack

- Node.js 20+
- Next.js App Router and React
- TypeScript
- SQLite via `better-sqlite3` and Drizzle ORM
- Model Context Protocol SDK
- Tailwind CSS
- Vitest and Playwright

## License

MIT
