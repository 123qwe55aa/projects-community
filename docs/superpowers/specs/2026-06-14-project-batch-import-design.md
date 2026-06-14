# Project Batch Import Design

## Goal

Add a strict, versioned project template and a command-line importer that work well for both people
and agents. A batch can be authored as YAML or JSON, validated before writing, imported
idempotently, and immediately displayed in the V2 Dashboard with traceable event history.

## Scope

The first version imports only core Project initialization data:

- stable external key;
- summary;
- background;
- lifecycle state;
- building style;
- source reference.

It does not import Observations, arbitrary Project Events, Decisions, Candidates, or relationships.
Those retain their existing ingestion and governance flows.

## Template Contract

Both YAML and JSON use the same strict, versioned contract:

```yaml
version: 1
projects:
  - key: projects-community
    summary: Local-first project observatory
    background: Track project evidence, changes, and decisions over time.
    lifecycleState: active
    buildingStyle: workshop
    sourceRef: manual:2026-06-14
```

The top-level object and every Project object reject unknown fields.

### Fields

| Field | Required | Validation | Default |
| --- | --- | --- | --- |
| `key` | yes | non-empty string, maximum 200 characters | none |
| `summary` | yes | non-empty string, maximum 1000 characters | none |
| `background` | yes | non-empty string, maximum 2000 characters | none |
| `lifecycleState` | no | `active`, `dormant`, `ended`, or `archived` | `active` |
| `buildingStyle` | no | `workshop`, `data-center`, `studio`, or `community-hall` | `workshop` |
| `sourceRef` | no | non-empty string, maximum 500 characters | `batch-import:<filename>` |

Keys must be unique within one input file.

## Stable Key Storage

Add a `project_import_keys` table rather than using the external key as the Project primary key or
adding an import-specific field to every Project.

The table stores:

- unique `key`;
- referenced `project_id`;
- canonical hash of the validated Project input;
- `source_ref`;
- creation timestamp.

This preserves existing random Project IDs while exposing a durable mapping for future imports and
diagnostics.

## Import Behavior

Add this command:

```bash
npm run projects:import -- path/to/projects.yaml
npm run projects:import -- path/to/projects.json
npm run projects:import -- path/to/projects.yaml --dry-run
```

The importer selects YAML or JSON from the file extension. Unsupported extensions fail before any
database access.

The importer parses and validates the entire document before opening the write transaction. A
validation error reports the relevant field path and writes nothing.

For each validated Project:

1. Compute a deterministic canonical hash of its normalized values.
2. Look up its stable key in `project_import_keys`.
3. If the key does not exist, create the Project and its import mapping.
4. If the key exists with the same hash, skip it as an idempotent replay.
5. If the key exists with a different hash, fail the entire batch as a conflict.

All new Projects in a batch are written in one immediate transaction. Any conflict or database
failure rolls back the entire batch.

The command prints a concise result with the file, number found, number created, and number skipped.
Failures exit non-zero and identify the conflicting key or validation path.

## Project Initialization

Each newly imported Project receives:

- a `projects` record with the supplied summary, background, and building style;
- `growthStage` set to `seed`;
- `visibility` set to `private`;
- a `project_created` event containing the summary;
- a `lifecycle_inferred` event when the supplied lifecycle state is not `active`;
- a current V2 Project snapshot generated within the same transaction.

Import events use actor `batch-import`. Their idempotency keys derive from the stable Project key.
The source reference is included in event rationale so the initial state remains traceable from the
timeline.

The importer does not create a legacy V1 conversation because batch import is a V2 initialization
path, not an interactive writing session.

## Dry Run

`--dry-run` performs file parsing, strict validation, normalization, hashing, and stable-key
comparison without writing. It reports how many Projects would be created, skipped, or conflict.
A conflict still exits non-zero so agents can use dry run as a reliable preflight check.

## Files And Documentation

- Add shared batch import contracts and normalization helpers under `src/lib/v2`.
- Add the transactional import service under `src/lib/v2`.
- Add the CLI entry point under `src/db`.
- Add a database migration for `project_import_keys`.
- Add equivalent example files under `templates/`.
- Document template fields and import commands in `README.md`.

YAML parsing should use a maintained parser dependency. JSON uses the platform parser. Both formats
must feed the same Zod schema and import service.

## Testing

Automated tests cover:

- equivalent YAML and JSON parsing;
- defaults and strict field validation;
- duplicate keys within one file;
- successful creation of Projects, import mappings, events, and snapshots;
- non-active lifecycle initialization;
- same-key same-content idempotent replay;
- same-key changed-content conflict;
- whole-batch rollback on conflict;
- dry run with no writes;
- CLI target database selection and non-zero failure behavior.

## Success Criteria

- A person can duplicate and edit the YAML example, then import it with one command.
- An agent can generate JSON from the same documented contract and import it with one command.
- Running the same valid import repeatedly creates no duplicates.
- Changed data under an existing key cannot silently overwrite a Project.
- Every imported Project appears immediately in the V2 Dashboard and has traceable initialization
  events.
