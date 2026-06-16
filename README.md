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

## Batch Import Projects

Use the versioned batch template to create multiple Projects from YAML or JSON. Start from
[`templates/projects.example.yaml`](templates/projects.example.yaml) or
[`templates/projects.example.json`](templates/projects.example.json); both examples contain the
same two Projects.

```yaml
version: 1
projects:
  - key: stable-project-key
    summary: Short description of the Project.
    background: Context, motivation, and intended outcome.
    lifecycleState: active
    buildingStyle: workshop
    sourceRef: manual:project-batch
```

The top-level object is strict and contains:

- `version` (required): currently `1`.
- `projects` (required): an array of Project objects.

Each Project object is strict and supports:

- `key` (required): stable, unique identifier; maximum 200 characters.
- `summary` (required): non-empty description; maximum 1,000 characters.
- `background` (required): non-empty context; maximum 2,000 characters.
- `lifecycleState` (optional): `active`, `dormant`, `ended`, or `archived`; defaults to `active`.
- `buildingStyle` (optional): `workshop`, `data-center`, `studio`, or `community-hall`; defaults to
  `workshop`.
- `sourceRef` (optional): non-empty source reference, maximum 500 characters; defaults to
  `batch-import:<filename>`.

Import either format with the same command:

```bash
npm run projects:import -- templates/projects.example.yaml
npm run projects:import -- templates/projects.example.json
```

The stable `key` makes imports idempotent. Re-importing the same normalized content skips the
existing Project. Reusing a key with changed content reports a conflict and rolls back the entire
batch.

Preview an import with `--dry-run`:

```bash
npm run projects:import -- templates/projects.example.yaml --dry-run
```

A dry run uses a temporary database snapshot for validation, comparison, and migrations. It does
not create, migrate, or write to the configured real database.

## Statistics Manager

The Statistics Manager adds a local portfolio overview for Project counts, inferred Project types,
GitHub repository bindings, cumulative repository metrics, and 30-day contribution activity.

Open `/statistics` to review the portfolio view. Each Project also has a detail page at
`/projects/<project-id>/statistics` where you can bind or update its GitHub repository, refresh the
local GitHub snapshot, and set an optional manual type override.

Configure a GitHub token before syncing private repositories or higher-volume accounts:

```env
GITHUB_TOKEN=github_pat_...
```

Optional GitHub Enterprise or test API endpoint:

```env
GITHUB_API_BASE_URL=https://api.github.example.com
```

Statistics are intentionally stored as local snapshots. The app does not auto-sync in the
background; use **Sync all** from `/statistics` or **Sync project** on an individual Project
statistics page when you want fresh GitHub counts.

When importing from GitHub, the app compares repository name and description against existing
unbound Projects. If a likely match appears, you can bind the repository to that Project instead of
creating a duplicate. Binding only records the GitHub repository relationship and leaves the
existing Project fields, evidence, Decisions, and related data unchanged.

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
npm run projects:import -- templates/projects.example.yaml --dry-run
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
