# Project Batch Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add strict YAML/JSON Project templates and an idempotent transactional CLI importer that creates immediately visible V2 Projects.

**Architecture:** A shared Zod contract parses both file formats into normalized Project inputs. A focused import service owns hashing, stable-key conflict detection, transactional Project/event creation, and projection. A thin CLI owns environment loading, argument parsing, file parsing, reporting, and exit status.

**Tech Stack:** TypeScript, Zod, YAML, Drizzle ORM, SQLite, Vitest, tsx

---

### Task 1: Add Stable Import Key Storage

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0007_project_import_keys.sql`
- Modify: `drizzle/meta/_journal.json`
- Test: `src/lib/v2/schema.test.ts`

- [ ] **Step 1: Write a failing schema test**

Add a test that migrates a fresh database, inserts a Project and `project_import_keys` row, then
asserts duplicate keys fail and deleting the referenced Project fails.

- [ ] **Step 2: Run the schema test and verify it fails**

Run: `npm test -- src/lib/v2/schema.test.ts`

Expected: FAIL because `project_import_keys` is not exported and the table does not exist.

- [ ] **Step 3: Add the table and migration**

Export `projectImportKeys` from `src/db/schema.ts` with:

```ts
export const projectImportKeys = sqliteTable('project_import_keys', {
  key: text('key').primaryKey(),
  projectId: text('project_id').references(() => projects.id).notNull(),
  contentHash: text('content_hash').notNull(),
  sourceRef: text('source_ref').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => [uniqueIndex('project_import_keys_project_id_unique').on(table.projectId)]);
```

Create the matching migration and journal entry.

- [ ] **Step 4: Run the schema test**

Run: `npm test -- src/lib/v2/schema.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/lib/v2/schema.test.ts drizzle
git commit -m "feat: add stable project import keys"
```

### Task 2: Define And Parse The Batch Contract

**Files:**
- Create: `src/lib/v2/project-batch-contract.ts`
- Create: `src/lib/v2/project-batch-contract.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add failing contract tests**

Test that YAML and JSON parse to identical normalized values, defaults are applied, unknown fields
are rejected, duplicate keys are rejected, and unsupported extensions fail.

- [ ] **Step 2: Run the contract tests and verify they fail**

Run: `npm test -- src/lib/v2/project-batch-contract.test.ts`

Expected: FAIL because the contract module does not exist.

- [ ] **Step 3: Add YAML dependency and contract implementation**

Install `yaml`. Implement:

```ts
export type ProjectBatch = z.infer<typeof projectBatchSchema>;
export function parseProjectBatchFile(contents: string, filename: string): ProjectBatch;
export function normalizeProjectBatch(batch: ProjectBatch, filename: string): NormalizedProjectBatch;
export function hashProjectImport(project: NormalizedProjectImport): string;
```

Use strict Zod objects, trim string fields, apply documented defaults, reject duplicate keys, parse
`.yaml`/`.yml` with `yaml` and `.json` with `JSON.parse`, and hash a stable ordered JSON object with
SHA-256.

- [ ] **Step 4: Run the contract tests**

Run: `npm test -- src/lib/v2/project-batch-contract.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/v2/project-batch-contract.ts src/lib/v2/project-batch-contract.test.ts package.json package-lock.json pnpm-lock.yaml
git commit -m "feat: define project batch import contract"
```

### Task 3: Implement Transactional Project Import

**Files:**
- Create: `src/lib/v2/project-batch-import.ts`
- Create: `src/lib/v2/project-batch-import.test.ts`

- [ ] **Step 1: Add failing import service tests**

Cover:

- Project, stable-key mapping, `project_created` event, and snapshot creation;
- non-active lifecycle event and projected state;
- same-content replay skip;
- changed-content conflict;
- whole-batch rollback on conflict;
- dry run with no writes.

- [ ] **Step 2: Run the service tests and verify they fail**

Run: `npm test -- src/lib/v2/project-batch-import.test.ts`

Expected: FAIL because the import service does not exist.

- [ ] **Step 3: Implement the import service**

Export:

```ts
export type ProjectBatchImportResult = {
  projectsFound: number;
  projectsCreated: number;
  projectsSkipped: number;
  dryRun: boolean;
};

export async function importProjectBatch(
  batch: NormalizedProjectBatch,
  options?: { dryRun?: boolean },
): Promise<ProjectBatchImportResult>;
```

Perform comparison and writes in one immediate transaction. Throw
`Project import conflict for key "<key>"` on a changed-content key. For new Projects insert the
Project, mapping, initialization events, and call `projectProjectInTransaction`.

- [ ] **Step 4: Run service and related projection tests**

Run: `npm test -- src/lib/v2/project-batch-import.test.ts src/lib/v2/projection/project.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/v2/project-batch-import.ts src/lib/v2/project-batch-import.test.ts
git commit -m "feat: add transactional project batch import"
```

### Task 4: Add The CLI

**Files:**
- Create: `src/db/project-batch-import-cli.ts`
- Create: `src/db/project-batch-import-cli.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add failing CLI tests**

Spawn the CLI against temporary target databases and verify valid import output, dry-run no-write
behavior, missing path failure, unsupported extension failure, validation path reporting, conflict
failure, and `PROJECTS_COMMUNITY_DB_PATH` isolation.

- [ ] **Step 2: Run CLI tests and verify they fail**

Run: `npm test -- src/db/project-batch-import-cli.test.ts`

Expected: FAIL because the CLI and script do not exist.

- [ ] **Step 3: Implement the CLI and npm script**

Add:

```json
"projects:import": "tsx src/db/project-batch-import-cli.ts"
```

The CLI must initialize the selected database, parse `<file>` and optional `--dry-run`, read and
normalize the file, call `importProjectBatch`, print a concise result, close the database, and set a
non-zero exit code with a useful error message on failure.

- [ ] **Step 4: Run CLI tests**

Run: `npm test -- src/db/project-batch-import-cli.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/project-batch-import-cli.ts src/db/project-batch-import-cli.test.ts package.json
git commit -m "feat: add project batch import CLI"
```

### Task 5: Add Templates And User Documentation

**Files:**
- Create: `templates/projects.example.yaml`
- Create: `templates/projects.example.json`
- Modify: `README.md`

- [ ] **Step 1: Add equivalent example templates**

Create YAML and JSON examples containing the same two Projects and all documented fields.

- [ ] **Step 2: Document the workflow**

Add a README section explaining template fields, defaults, stable-key replay/conflict behavior,
`--dry-run`, and copyable import commands.

- [ ] **Step 3: Verify both templates parse and dry-run**

Run:

```bash
npm run projects:import -- templates/projects.example.yaml --dry-run
npm run projects:import -- templates/projects.example.json --dry-run
```

Expected: both report two Projects that would be created and write nothing.

- [ ] **Step 4: Commit**

```bash
git add templates README.md
git commit -m "docs: add project batch import templates"
```

### Task 6: Full Verification

**Files:**
- Modify only if verification reveals a defect.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/lib/v2/project-batch-contract.test.ts src/lib/v2/project-batch-import.test.ts src/db/project-batch-import-cli.test.ts src/lib/v2/schema.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full automated verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all commands PASS.

- [ ] **Step 3: Inspect final changes**

Run:

```bash
git status --short
git diff --check
git log --oneline -8
```

Expected: clean worktree, no whitespace errors, and feature commits present.
