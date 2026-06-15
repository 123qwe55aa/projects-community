# Statistics Manager Design

## Goal

Add a Statistics Manager that makes the Project portfolio measurable and easy to inspect. It binds
Projects to GitHub repositories, manually synchronizes repository contribution metrics, classifies
Projects by type, and presents both a portfolio overview and per-Project statistics.

The first version is repository-centric. It does not reproduce the personal GitHub contribution
calendar.

## Scope

The Statistics Manager provides:

- manual synchronization for one Project or all GitHub-bound Projects;
- cumulative GitHub commits, pull requests, issues, and stars;
- commits, pull requests, and issues created during the most recent 30-day window;
- a transparent recent-activity score;
- automatic Project type inference from GitHub topics and primary language;
- a manual type override that later synchronization cannot replace;
- a portfolio Statistics page and a per-Project statistics detail page.

It does not add scheduled background jobs, automatic synchronization on page load, arbitrary time
windows, personal contribution-calendar data, or historical trend charts.

## Data Model

### Project Statistics Configuration

Add a `project_statistics` table with at most one record per Project:

- `project_id`: unique foreign key to `projects`;
- `github_repo_full_name`: normalized `owner/repo`, nullable for unbound Projects and unique when
  present;
- `inferred_type`: latest type inferred from GitHub metadata;
- `manual_type`: optional user override;
- synchronization state: `last_attempted_at`, `last_successful_at`, and nullable `last_error`;
- `created_at`;
- `updated_at`.

The displayed Project type is `manual_type ?? inferred_type ?? "other"`. Synchronization may update
`inferred_type`, but never changes or clears `manual_type`.

The first-version type enum is:

- `application`;
- `library`;
- `tooling`;
- `data`;
- `content`;
- `infrastructure`;
- `community`;
- `other`.

Inference uses deterministic topic rules first, then primary-language fallback rules. Ambiguous or
unknown repositories become `other`. The inference helper is pure and independently tested.

### GitHub Statistics Snapshot

Add a `github_statistics_snapshots` table with at most one latest snapshot per Project:

- `project_id`: unique foreign key to `projects`;
- repository identity and metadata: `repo_full_name`, `repo_url`, `primary_language`, serialized
  topics, and GitHub `pushed_at`;
- cumulative metrics: `commit_count`, `pull_request_count`, `issue_count`, and `star_count`;
- recent metrics: `commits_30d`, `pull_requests_30d`, and `issues_30d`;
- derived `activity_score_30d`;
- `updated_at`.

The table is a mutable external-data read model, not part of the immutable V2 Project event store.
GitHub metric changes do not create Project Events.

Projects imported through the existing one-click GitHub flow create their repository binding in the
same transaction as the Project. Existing Projects can be bound from the Statistics detail page by
entering a GitHub URL or normalized `owner/repo`.

## Metric Definitions

GitHub metrics use these explicit definitions:

| Metric | Definition |
| --- | --- |
| cumulative commits | commits reachable from the repository default branch |
| cumulative pull requests | all pull requests, regardless of state |
| cumulative issues | all issues excluding records that represent pull requests |
| stars | repository `stargazers_count` |
| commits 30d | default-branch commits authored or committed since the UTC cutoff |
| pull requests 30d | pull requests created since the UTC cutoff |
| issues 30d | non-PR issues created since the UTC cutoff |

The synchronization service calculates the cutoff as exactly 30 days before the synchronization
attempt in UTC.

Recent activity uses the transparent formula:

```text
activity_score_30d = commits_30d + (pull_requests_30d * 3) + issues_30d
```

Stars remain a separate cumulative influence measure and do not affect recent activity.

## GitHub Client And Synchronization

Create a dedicated GitHub client rather than issuing API requests directly from Server Actions. It
uses `GITHUB_TOKEN`, a consistent user agent, GitHub API version headers, pagination helpers, and
typed error translation.

The client retrieves repository metadata and the metric inputs required by the definitions above.
It follows pagination or uses GitHub pagination link metadata where a total can be determined
without downloading every result. Search/count responses must exclude pull requests from issue
counts. The implementation handles token absence, inaccessible or deleted repositories, rate
limits, malformed responses, and network failures with user-readable errors.

The synchronization service exposes:

- synchronize one bound Project;
- synchronize every bound Project sequentially with a concise success/failure result per Project;
- bind or change a Project repository;
- set or clear a manual Project type override.

Each Project synchronization is isolated. A successful synchronization atomically updates the
configuration inference, synchronization state, and latest snapshot. A failed synchronization
updates only the configuration's attempt time and error, retaining any prior snapshot and last
successful timestamp. This also lets a first synchronization failure remain visible before a
snapshot exists. Failure of one Project does not stop synchronization of the remaining Projects.

Server Actions are thin wrappers around this service and revalidate the Statistics overview and
relevant Project detail routes.

## Read Models

Add statistics queries that return:

- portfolio totals: Project count, GitHub-bound Project count, recent 30-day contribution total,
  and cumulative stars;
- Project counts grouped by effective type;
- GitHub-bound Projects ranked by `activity_score_30d`;
- a filterable Project statistics table including binding, type, metrics, and synchronization
  status;
- one Project's configuration, latest GitHub snapshot, and effective type.

The portfolio recent-contribution total is the sum of recent commits, pull requests, and issues
without activity-score weighting. The activity score is used only for ranking.

## User Interface

Add a primary navigation entry named `Statistics`.

### Portfolio Statistics Page

The `/statistics` page contains:

- summary cards for total Projects, GitHub-bound Projects, recent 30-day contributions, and
  cumulative stars;
- a Project type distribution rendered as lightweight CSS bars;
- a recent-activity ranking rendered as lightweight CSS bars;
- a Project table filterable by effective type and GitHub binding status;
- a `Sync all` control;
- one synchronization control per bound Project;
- links from each Project row to its statistics detail page.

The page reads local snapshots and never contacts GitHub merely because it was opened. It shows the
last successful synchronization time and any latest synchronization error. Projects without a
binding remain visible with a clear unbound state.

### Project Statistics Detail Page

The `/projects/[id]/statistics` page contains:

- repository binding and link;
- effective type, inferred type, and manual type override editing;
- cumulative and recent metric cards;
- the activity score and last GitHub push time;
- last attempted and successful synchronization times;
- synchronization errors;
- controls to bind or change the repository and synchronize the Project.

The visual language follows the existing dark Tailwind interface. The first version uses CSS bars
and does not add a charting dependency.

## Error Handling

- A missing `GITHUB_TOKEN` prevents synchronization and produces an actionable message, but all
  locally stored statistics remain readable.
- A GitHub rate-limit response reports the reset time when GitHub supplies it.
- An inaccessible, renamed, or deleted repository records an error without clearing its binding or
  previous metrics.
- A Project cannot bind to a repository already bound to another Project.
- Invalid GitHub URLs and malformed `owner/repo` values fail validation before database writes.
- `Sync all` reports per-Project results so partial success is visible.

## Testing

Automated tests cover:

- repository binding normalization and duplicate-binding rejection;
- deterministic topic-first and language-fallback type inference;
- manual type override precedence and clearing;
- activity-score calculation;
- GitHub pagination and issue-versus-PR counting;
- cumulative and 30-day metric aggregation from deterministic GitHub fixtures;
- successful synchronization writes;
- failed synchronization preserving prior metrics and last-success time;
- partial success during synchronize-all;
- portfolio totals, type distribution, activity ranking, and detail read models;
- Server Action validation and route revalidation behavior;
- an end-to-end journey from Statistics overview to Project detail using deterministic fixtures,
  without a live GitHub dependency.

## Migration And Compatibility

Add a Drizzle migration for the two new tables and their uniqueness/index constraints. Existing
Projects remain valid and initially appear as unbound. Existing GitHub-imported Projects are not
silently inferred from arbitrary deployment URLs during migration; users can bind them explicitly,
while future one-click imports create bindings automatically.

The Statistics Manager remains separate from existing V1 decision statistics and V2 immutable
Project snapshots. It can be removed or rebuilt without changing Project event history.

## Success Criteria

- A user can bind a Project to a GitHub repository and manually synchronize it.
- One-click GitHub imports are immediately bound and ready to synchronize.
- The Statistics overview makes Project count, type mix, recent activity, and cumulative stars
  visible from locally stored data.
- A user can inspect cumulative and recent GitHub contribution metrics for one Project.
- Automatic type inference is useful but never overwrites a manual type selection.
- A failed GitHub request does not erase the last successful statistics or block other Projects.
- Tests do not require live GitHub access.
