# Statistics Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repository-centric Statistics Manager with manual GitHub synchronization, Project type classification, user-confirmed existing-Project matching, a portfolio overview, and per-Project statistics.

**Architecture:** Store GitHub bindings and synchronization state in `project_statistics`, and store the latest successful external metrics in `github_statistics_snapshots`. Keep deterministic matching/type/scoring helpers pure, isolate GitHub HTTP behavior behind a typed client, and expose writes through a statistics service plus thin Server Actions. Read the UI exclusively from local SQLite snapshots.

**Tech Stack:** Next.js App Router, React 19, TypeScript, SQLite, Drizzle ORM, Vitest, Playwright, Tailwind CSS

---

## File Structure

### Create

- `src/lib/statistics/types.ts`: shared Project type and GitHub statistics contracts.
- `src/lib/statistics/classification.ts`: pure type inference and activity-score helpers.
- `src/lib/statistics/matching.ts`: pure existing-Project match scoring and ranking.
- `src/lib/statistics/github-client.ts`: typed GitHub REST client, pagination, and error translation.
- `src/lib/statistics/service.ts`: repository binding, synchronization, manual type override, and confirmed merge behavior.
- `src/lib/statistics/queries.ts`: portfolio and Project-detail statistics read models.
- `src/lib/statistics/classification.test.ts`: classification and activity-score tests.
- `src/lib/statistics/matching.test.ts`: deterministic matching tests.
- `src/lib/statistics/github-client.test.ts`: HTTP aggregation, pagination, and error tests.
- `src/lib/statistics/service.test.ts`: database write, synchronization, and merge-preservation tests.
- `src/lib/statistics/queries.test.ts`: portfolio and detail read-model tests.
- `src/app/statistics-actions.ts`: thin Server Actions for statistics writes.
- `src/app/statistics-actions.test.ts`: action validation/delegation tests.
- `src/app/statistics/page.tsx`: portfolio Statistics page.
- `src/app/statistics/statistics-manager.tsx`: filters, sync controls, status, CSS charts, and Project table.
- `src/app/projects/[id]/statistics/page.tsx`: per-Project statistics page.
- `src/app/projects/[id]/statistics/project-statistics-manager.tsx`: binding, type override, and single sync controls.
- `src/app/projects/github-match-confirmation.tsx`: ranked existing-Project match confirmation UI.
- `e2e/statistics.spec.ts`: deterministic overview-to-detail journey.
- `drizzle/0009_statistics_manager.sql`: generated migration.
- `drizzle/meta/0009_snapshot.json`: generated Drizzle snapshot.

### Modify

- `src/db/schema.ts`: add `projectStatistics` and `githubStatisticsSnapshots`.
- `src/lib/v2/schema.test.ts`: verify uniqueness, foreign keys, and migration behavior.
- `src/app/actions.ts`: make GitHub import create bindings and expose match-preview/create-or-bind flow.
- `src/app/projects/import-github-modal.tsx`: insert match confirmation before creating a duplicate Project.
- `src/components/NavBar.tsx`: add `Statistics` primary navigation entry.
- `src/app/projects/[id]/page.tsx`: link to Project statistics detail.
- `.env.example`: document optional `GITHUB_API_BASE_URL` used for deterministic fixtures.
- `README.md`: document Statistics Manager setup and manual synchronization.

## Task 1: Statistics Schema And Migration

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/lib/v2/schema.test.ts`
- Create: `drizzle/0009_statistics_manager.sql`
- Create: `drizzle/meta/0009_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

- [ ] **Step 1: Write failing schema tests**

Add imports for `projectStatistics` and `githubStatisticsSnapshots`, then add tests equivalent to:

```ts
it('stores one statistics configuration and latest snapshot per project', () => {
  const { db } = createTestDatabase();
  db.insert(projects).values([
    { id: 'project-1', summary: 'One' },
    { id: 'project-2', summary: 'Two' },
  ]).run();

  db.insert(projectStatistics).values({
    projectId: 'project-1',
    githubRepoFullName: 'owner/repo',
    inferredType: 'tooling',
    createdAt: new Date(),
    updatedAt: new Date(),
  }).run();
  db.insert(githubStatisticsSnapshots).values({
    projectId: 'project-1',
    repoFullName: 'owner/repo',
    repoUrl: 'https://github.com/owner/repo',
    topics: '["cli"]',
    commitCount: 12,
    pullRequestCount: 3,
    issueCount: 4,
    starCount: 5,
    commits30d: 2,
    pullRequests30d: 1,
    issues30d: 1,
    activityScore30d: 6,
    updatedAt: new Date(),
  }).run();

  expect(db.select().from(projectStatistics).all()).toHaveLength(1);
  expect(db.select().from(githubStatisticsSnapshots).all()).toHaveLength(1);
});

it('rejects duplicate project configuration and duplicate repo binding', () => {
  // Insert two Projects, bind project-1, then assert duplicate projectId and owner/repo fail.
});

it('deletes statistics read models when their Project is deleted', () => {
  // Seed a Project, configuration, and snapshot; delete the Project; assert both statistics rows
  // are gone so the existing deleteProjectAction remains compatible.
});
```

- [ ] **Step 2: Run schema tests and verify failure**

Run:

```bash
npm test -- src/lib/v2/schema.test.ts
```

Expected: FAIL because the new schema exports do not exist.

- [ ] **Step 3: Add Drizzle tables**

Add tables with these exact responsibilities:

```ts
export const projectStatistics = sqliteTable(
  'project_statistics',
  {
    projectId: text('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
    githubRepoFullName: text('github_repo_full_name'),
    inferredType: text('inferred_type'),
    manualType: text('manual_type'),
    lastAttemptedAt: integer('last_attempted_at', { mode: 'timestamp' }),
    lastSuccessfulAt: integer('last_successful_at', { mode: 'timestamp' }),
    lastError: text('last_error'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('project_statistics_github_repo_unique').on(table.githubRepoFullName),
  ],
);

export const githubStatisticsSnapshots = sqliteTable('github_statistics_snapshots', {
  projectId: text('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  repoFullName: text('repo_full_name').notNull(),
  repoUrl: text('repo_url').notNull(),
  primaryLanguage: text('primary_language'),
  topics: text('topics').notNull(),
  pushedAt: integer('pushed_at', { mode: 'timestamp' }),
  commitCount: integer('commit_count').notNull(),
  pullRequestCount: integer('pull_request_count').notNull(),
  issueCount: integer('issue_count').notNull(),
  starCount: integer('star_count').notNull(),
  commits30d: integer('commits_30d').notNull(),
  pullRequests30d: integer('pull_requests_30d').notNull(),
  issues30d: integer('issues_30d').notNull(),
  activityScore30d: integer('activity_score_30d').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
```

- [ ] **Step 4: Generate and inspect migration**

Run:

```bash
npm run db:generate
```

Expected: creates `drizzle/0009_*.sql`, updates the journal, and creates the snapshot. Rename the SQL file to `drizzle/0009_statistics_manager.sql` only if the generated journal tag is updated consistently.

Inspect the migration and confirm it creates both tables, the unique repository index, and both Project foreign keys.

- [ ] **Step 5: Run schema and migration tests**

Run:

```bash
npm test -- src/lib/v2/schema.test.ts src/db/migrate.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/lib/v2/schema.test.ts drizzle
git commit -m "feat: add statistics manager schema"
```

## Task 2: Pure Classification, Activity, And Matching Logic

**Files:**
- Create: `src/lib/statistics/types.ts`
- Create: `src/lib/statistics/classification.ts`
- Create: `src/lib/statistics/classification.test.ts`
- Create: `src/lib/statistics/matching.ts`
- Create: `src/lib/statistics/matching.test.ts`

- [ ] **Step 1: Write failing classification tests**

Cover topic-first inference, language fallback, manual override, and scoring:

```ts
expect(inferProjectType({ topics: ['cli'], primaryLanguage: 'TypeScript' })).toBe('tooling');
expect(inferProjectType({ topics: [], primaryLanguage: 'Jupyter Notebook' })).toBe('data');
expect(inferProjectType({ topics: [], primaryLanguage: null })).toBe('other');
expect(effectiveProjectType({ inferredType: 'tooling', manualType: 'application' }))
  .toBe('application');
expect(activityScore30d({ commits30d: 4, pullRequests30d: 2, issues30d: 3 })).toBe(13);
```

Define `ProjectType` as:

```ts
export const PROJECT_TYPES = [
  'application',
  'library',
  'tooling',
  'data',
  'content',
  'infrastructure',
  'community',
  'other',
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];
```

- [ ] **Step 2: Write failing matching tests**

Use cases:

```ts
expect(rankProjectMatches(repo, projects)[0]).toMatchObject({
  projectId: 'exact',
  score: 0.95,
});
expect(rankProjectMatches(repo, projects)).toHaveLength(5);
expect(rankProjectMatches(unrelatedRepo, projects)).toEqual([]);
expect(scoreProjectMatch(repo, project)).toBeCloseTo(expectedScore, 5);
```

Also assert case, whitespace, punctuation, hyphen, and underscore normalization.
Assert each suggestion includes human-readable `matchReasons`, such as `Exact normalized name` or
`Description overlaps Project summary`, for the confirmation UI.

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
npm test -- src/lib/statistics/classification.test.ts src/lib/statistics/matching.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement pure helpers**

Implement:

```ts
export function inferProjectType(input: {
  topics: string[];
  primaryLanguage: string | null;
}): ProjectType;

export function effectiveProjectType(input: {
  inferredType: string | null;
  manualType: string | null;
}): ProjectType;

export function activityScore30d(input: {
  commits30d: number;
  pullRequests30d: number;
  issues30d: number;
}): number;

export function scoreProjectMatch(repo: RepositoryMatchInput, project: ProjectMatchInput): number;
export function rankProjectMatches(
  repo: RepositoryMatchInput,
  projects: ProjectMatchInput[],
): ProjectMatchSuggestion[];
```

Use token-set Jaccard similarity. Apply the specified `0.60 / 0.25 / 0.15` composite, exact normalized-name floor `0.95`, threshold `0.60`, descending score order with `projectId` as deterministic tie-breaker, and limit five.
Return the individual component scores and `matchReasons` in each suggestion so the UI never has to
recompute matching logic.

- [ ] **Step 5: Run pure-helper tests**

Run:

```bash
npm test -- src/lib/statistics/classification.test.ts src/lib/statistics/matching.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/statistics
git commit -m "feat: add statistics classification and matching"
```

## Task 3: Typed GitHub Statistics Client

**Files:**
- Create: `src/lib/statistics/github-client.ts`
- Create: `src/lib/statistics/github-client.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing GitHub client tests**

Stub `globalThis.fetch` and cover:

```ts
it('aggregates repository metadata and cumulative and 30-day counts', async () => {
  const client = createGitHubClient({
    token: 'test-token',
    baseUrl: 'https://github.test',
    now: () => new Date('2026-06-15T00:00:00.000Z'),
  });

  await expect(client.fetchRepositoryStatistics('owner/repo')).resolves.toMatchObject({
    repoFullName: 'owner/repo',
    starCount: 8,
    commitCount: 41,
    pullRequestCount: 12,
    issueCount: 7,
    commits30d: 5,
    pullRequests30d: 2,
    issues30d: 3,
  });
});
```

Add explicit tests for link-header pagination counts, issue search excluding PRs, missing token,
404, malformed JSON, and rate-limit reset time.

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- src/lib/statistics/github-client.test.ts
```

Expected: FAIL because the client does not exist.

- [ ] **Step 3: Implement the client**

Expose:

```ts
export type GitHubRepositoryStatistics = {
  repoFullName: string;
  repoUrl: string;
  description: string;
  primaryLanguage: string | null;
  topics: string[];
  pushedAt: Date | null;
  starCount: number;
  commitCount: number;
  pullRequestCount: number;
  issueCount: number;
  commits30d: number;
  pullRequests30d: number;
  issues30d: number;
};

export function normalizeGitHubRepo(value: string): string;
export function createGitHubClient(options?: {
  token?: string;
  baseUrl?: string;
  now?: () => Date;
}): {
  fetchRepositoryStatistics(repoFullName: string): Promise<GitHubRepositoryStatistics>;
};
```

Use `GITHUB_TOKEN` and `GITHUB_API_BASE_URL ?? "https://api.github.com"` as defaults. Send
`Accept`, `Authorization`, `User-Agent`, and `X-GitHub-Api-Version` headers. Convert GitHub failures
into actionable `Error` messages.

Implement the approved metric definitions exactly: commits are reachable from the default branch;
pull requests include all states; issues exclude API records/search results representing pull
requests; recent metrics use a UTC cutoff exactly 30 days before the injected `now()`. Parse
pagination `Link` headers for totals where possible and follow pages when filtering is required.

- [ ] **Step 4: Document fixture base URL**

Add to `.env.example`:

```env
# Optional: override only for deterministic local/test GitHub fixtures.
GITHUB_API_BASE_URL=https://api.github.com
```

- [ ] **Step 5: Run client tests**

Run:

```bash
npm test -- src/lib/statistics/github-client.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/statistics/github-client.ts src/lib/statistics/github-client.test.ts .env.example
git commit -m "feat: add github statistics client"
```

## Task 4: Statistics Binding And Synchronization Service

**Files:**
- Create: `src/lib/statistics/service.ts`
- Create: `src/lib/statistics/service.test.ts`
- Modify: `src/app/actions.ts`

- [ ] **Step 1: Write failing service tests**

Cover repository binding, duplicate rejection, manual type behavior, successful sync, failed sync,
sync-all partial success, confirmed merge preservation, and GitHub create flow:

```ts
it('binds a confirmed match without changing the existing Project', async () => {
  const before = seedExistingProjectWithRelatedRecords();
  await bindRepository({
    projectId: before.projectId,
    repoFullName: 'owner/existing-project',
  });
  const after = readExistingProjectWithRelatedRecords(before.projectId);

  expect(after.project).toEqual(before.project);
  expect(after.relatedCounts).toEqual(before.relatedCounts);
  expect(after.statistics?.githubRepoFullName).toBe('owner/existing-project');
});

it('preserves the last successful snapshot when synchronization fails', async () => {
  // Seed prior snapshot, inject a failing GitHub client, synchronize, then assert metrics unchanged
  // while lastAttemptedAt and lastError changed.
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- src/lib/statistics/service.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement service operations**

Expose dependency-injectable functions:

```ts
export async function bindRepository(input: {
  projectId: string;
  repoFullName: string;
}): Promise<void>;

export async function setManualProjectType(input: {
  projectId: string;
  manualType: ProjectType | null;
}): Promise<void>;

export async function synchronizeProjectStatistics(
  projectId: string,
  dependencies?: StatisticsDependencies,
): Promise<SynchronizationResult>;

export async function synchronizeAllProjectStatistics(
  dependencies?: StatisticsDependencies,
): Promise<SynchronizationResult[]>;

export async function createProjectFromGitHub(input: {
  repoFullName: string;
  metadata: GitHubImportMetadata;
}): Promise<{ projectId: string }>;
```

Use one SQLite transaction per Project write. On success, upsert the configuration inference and
snapshot, clear `lastError`, and update both timestamps. On failure, update only
`lastAttemptedAt`, `lastError`, and `updatedAt`, then return a failed result rather than throwing
from sync-all. `bindRepository` must validate the Project and reject duplicate repo bindings.

- [ ] **Step 4: Route one-click Project creation through the binding service**

Refactor `importOneClickRepoAction` so new Projects and their binding are created atomically through
`createProjectFromGitHub`. Keep README/metadata import behavior, but remove direct duplicate binding
logic from the action.

- [ ] **Step 5: Run service and existing action-adjacent tests**

Run:

```bash
npm test -- src/lib/statistics/service.test.ts src/db/project-batch-import-cli.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/statistics/service.ts src/lib/statistics/service.test.ts src/app/actions.ts
git commit -m "feat: add statistics synchronization service"
```

## Task 5: Statistics Read Models And Server Actions

**Files:**
- Create: `src/lib/statistics/queries.ts`
- Create: `src/lib/statistics/queries.test.ts`
- Create: `src/app/statistics-actions.ts`
- Create: `src/app/statistics-actions.test.ts`

- [ ] **Step 1: Write failing query tests**

Seed bound, unbound, manually typed, and failed-sync Projects. Assert:

```ts
const overview = await getStatisticsOverview();
expect(overview.summary).toEqual({
  projectCount: 4,
  boundProjectCount: 3,
  recentContributionCount: 17,
  starCount: 23,
});
expect(overview.typeDistribution[0]).toMatchObject({ type: 'tooling', count: 2 });
expect(overview.activityRanking.map(({ projectId }) => projectId)).toEqual(['active', 'quiet']);
expect(overview.projects.find(({ projectId }) => projectId === 'failed')?.lastError)
  .toBe('GitHub API rate limit exceeded');
```

Also test `getProjectStatisticsDetail(projectId)` and missing Project behavior.

- [ ] **Step 2: Write failing Server Action tests**

Mock service functions and `next/cache`. Assert form validation, delegation, and revalidation of:

```text
/statistics
/projects
/projects/<projectId>
/projects/<projectId>/statistics
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
npm test -- src/lib/statistics/queries.test.ts src/app/statistics-actions.test.ts
```

Expected: FAIL because modules do not exist.

- [ ] **Step 4: Implement read models**

Expose:

```ts
export async function getStatisticsOverview(): Promise<StatisticsOverview>;
export async function getProjectStatisticsDetail(
  projectId: string,
): Promise<ProjectStatisticsDetail | null>;
export async function getGitHubImportMatchSuggestions(
  repo: RepositoryMatchInput,
): Promise<ProjectMatchSuggestion[]>;
```

Read all Projects with left joins to configuration/snapshot, derive effective type through the pure
helper, sum recent contributions without weighting, rank by `activityScore30d`, and exclude already
bound Projects from import match suggestions.

- [ ] **Step 5: Implement thin Server Actions**

Add:

```ts
export async function synchronizeProjectStatisticsAction(formData: FormData);
export async function synchronizeAllProjectStatisticsAction();
export async function bindProjectRepositoryAction(formData: FormData);
export async function setManualProjectTypeAction(formData: FormData);
```

Validate all form values before calling the service. Accept an empty manual type as clear; otherwise
require a member of `PROJECT_TYPES`.

- [ ] **Step 6: Run query and action tests**

Run:

```bash
npm test -- src/lib/statistics/queries.test.ts src/app/statistics-actions.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/statistics/queries.ts src/lib/statistics/queries.test.ts src/app/statistics-actions.ts src/app/statistics-actions.test.ts
git commit -m "feat: add statistics queries and actions"
```

## Task 6: Portfolio Statistics Page

**Files:**
- Create: `src/app/statistics/page.tsx`
- Create: `src/app/statistics/statistics-manager.tsx`
- Modify: `src/components/NavBar.tsx`

- [ ] **Step 1: Add `Statistics` navigation and server page**

Add the primary link:

```ts
{ href: '/statistics', label: 'Statistics', icon: '▥' },
```

Make `src/app/statistics/page.tsx` a dynamic server page that calls `getStatisticsOverview()` and
passes its serializable data to `StatisticsManager`.

- [ ] **Step 2: Implement the portfolio client UI**

The component must render:

- four accessible summary cards;
- type-distribution CSS bars;
- activity-ranking CSS bars;
- type and binding filters;
- `Sync all`;
- single-Project sync buttons for bound Projects;
- error and last-success status;
- links to `/projects/[id]/statistics`.

Use `<form action={...}>` for write controls and `useState` only for filters. Add stable accessible
labels such as `Project type filter`, `GitHub binding filter`, `Project type distribution`, and
`Recent activity ranking`.

- [ ] **Step 3: Run lint and build**

Run:

```bash
npm run lint
npm run build
```

Expected: PASS and `/statistics` builds successfully.

- [ ] **Step 4: Commit**

```bash
git add src/app/statistics src/components/NavBar.tsx
git commit -m "feat: add portfolio statistics page"
```

## Task 7: Project Statistics Detail Page

**Files:**
- Create: `src/app/projects/[id]/statistics/page.tsx`
- Create: `src/app/projects/[id]/statistics/project-statistics-manager.tsx`
- Modify: `src/app/projects/[id]/page.tsx`

- [ ] **Step 1: Implement the server detail route**

Load `getProjectStatisticsDetail(id)`, call `notFound()` for a missing Project, and render breadcrumb,
repository status, effective/inferred/manual types, cumulative metrics, recent metrics, activity
score, pushed time, attempted/success times, and latest error.

- [ ] **Step 2: Implement binding, type, and sync controls**

Render forms using the statistics actions:

```tsx
<form action={bindProjectRepositoryAction}>
  <input type="hidden" name="projectId" value={project.projectId} />
  <input aria-label="GitHub repository" name="repoFullName" defaultValue={repoFullName ?? ''} />
  <button type="submit">Bind repository</button>
</form>
```

Add a Project type select containing `Automatic` plus every `PROJECT_TYPES` value, and a sync button
only when bound.

- [ ] **Step 3: Link existing Project detail to statistics**

Add a visible `Statistics` link from `src/app/projects/[id]/page.tsx` to
`/projects/${projectId}/statistics`.

- [ ] **Step 4: Run lint and build**

Run:

```bash
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/projects/[id]/statistics' 'src/app/projects/[id]/page.tsx'
git commit -m "feat: add project statistics detail"
```

## Task 8: GitHub Import Match Confirmation

**Files:**
- Modify: `src/app/actions.ts`
- Modify: `src/app/projects/import-github-modal.tsx`
- Create: `src/app/projects/github-match-confirmation.tsx`
- Modify: `src/lib/statistics/service.test.ts`

- [ ] **Step 1: Add failing import-match flow tests**

Test actions/services for:

```ts
expect(await previewGitHubImportMatches('owner/repo')).toMatchObject({
  repo: { fullName: 'owner/repo' },
  suggestions: [{ projectId: 'existing', score: 0.95 }],
});

expect(await confirmGitHubImportMatch({
  repoFullName: 'owner/repo',
  projectId: 'existing',
})).toEqual({ projectId: 'existing', merged: true });
```

Assert that a confirmed match creates no Project and changes no existing Project fields or related
records. Assert create-new produces one new Project and one binding.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/lib/statistics/service.test.ts
```

Expected: FAIL because preview/confirm functions do not exist.

- [ ] **Step 3: Add preview and confirmed-bind action flow**

Refactor one-click import into explicit operations:

```ts
export async function previewOneClickRepoImportAction(fullName: string): Promise<{
  repo: RepoImportPreview;
  suggestions: ProjectMatchSuggestion[];
}>;

export async function completeOneClickRepoImportAction(formData: FormData): Promise<{
  projectId: string;
  merged: boolean;
}>;
```

`completeOneClickRepoImportAction` accepts `mode=bind-existing|create-new`; `bind-existing` requires
`projectId`, verifies the target remains unbound, and attaches the repo. `create-new` uses the
existing metadata/README creation path and atomically creates the binding.

- [ ] **Step 4: Add match confirmation UI**

Change `ImportGithubModal.handleImport` to preview first. When suggestions exist, render
`GitHubMatchConfirmation` showing:

- existing Project summary and background excerpt;
- percentage score and match reasons;
- `Use existing Project`;
- `Create new Project`;
- `Cancel`.

When no suggestions meet the threshold, immediately complete `create-new` to retain one-click
behavior.

- [ ] **Step 5: Run focused tests, lint, and build**

Run:

```bash
npm test -- src/lib/statistics/service.test.ts src/lib/statistics/matching.test.ts
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/actions.ts src/app/projects/import-github-modal.tsx src/app/projects/github-match-confirmation.tsx src/lib/statistics/service.test.ts
git commit -m "feat: confirm github project matches before import"
```

## Task 9: Deterministic End-To-End Journey And Documentation

**Files:**
- Create: `e2e/statistics.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the failing Playwright journey**

Seed Projects, configurations, and snapshots directly through Drizzle so no live GitHub request is
needed. Cover:

```ts
test('shows portfolio statistics and edits a Project type', async ({ page }) => {
  const fixture = seedStatisticsJourney();
  await page.goto('/statistics');
  await expect(page.getByRole('heading', { name: 'Statistics' })).toBeVisible();
  await expect(page.getByLabel('Recent activity ranking')).toContainText(fixture.activeProject);
  await page.getByRole('link', { name: fixture.activeProject }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${fixture.activeProjectId}/statistics$`));
  await page.getByLabel('Project type').selectOption('application');
  await page.getByRole('button', { name: 'Save type' }).click();
  await expect(page.getByText('application', { exact: true })).toBeVisible();
});
```

Also cover unbound state and a displayed prior synchronization error. Keep network synchronization
out of Playwright; HTTP aggregation is already deterministic in `github-client.test.ts`.

- [ ] **Step 2: Run Playwright test and verify failure**

Run:

```bash
npx playwright test e2e/statistics.spec.ts
```

Expected: FAIL until labels/routes are fully aligned.

- [ ] **Step 3: Align UI accessibility and make E2E pass**

Adjust only labels, route links, and missing visible state needed by the journey. Do not add new
feature scope.

- [ ] **Step 4: Document setup and behavior**

Add a README section covering:

```text
- set GITHUB_TOKEN;
- open Statistics;
- bind repositories or import from GitHub;
- review match suggestions before binding an existing Project;
- use Sync all or single-Project sync;
- metrics are local snapshots and pages do not auto-sync.
```

- [ ] **Step 5: Run complete verification**

Run:

```bash
npm test
npm run lint
npm run build
npx playwright test e2e/statistics.spec.ts
git diff --check
```

Expected: all commands PASS and `git diff --check` produces no output.

- [ ] **Step 6: Commit**

```bash
git add e2e/statistics.spec.ts README.md
git commit -m "test: cover statistics manager journey"
```

## Final Verification

- [ ] Confirm opening `/statistics` performs no GitHub requests.
- [ ] Confirm a first synchronization failure is visible without creating a fake zero snapshot.
- [ ] Confirm failed later synchronization preserves the last successful metrics.
- [ ] Confirm `Sync all` continues after one Project fails and reports partial success.
- [ ] Confirm manual type overrides survive synchronization and can be cleared.
- [ ] Confirm existing-Project match confirmation never changes summary/background or related data.
- [ ] Confirm create-new and confirmed-bind both enforce unique repository binding.
- [ ] Confirm all tests, lint, build, focused E2E, and `git diff --check` pass.
