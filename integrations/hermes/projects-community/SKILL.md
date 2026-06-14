---
name: projects-community
description: Query and explore the Projects Community database — discover schema, distinguish real vs test data, and extract structured summaries.
---

# Projects Community — Data Exploration

Use this skill when the user asks to "爬数据", "查数据", "look at data", "explore the database", or inspect the projects-community SQLite database.

## Database Location

`/Users/toby/Documents/Projects/projects-community/data/projects-community.db`

## Query Patterns

### Discover tables

```bash
cd /Users/toby/Documents/Projects/projects-community
sqlite3 data/projects-community.db ".tables"
```

### View schema of one table

```bash
sqlite3 data/projects-community.db ".schema projects"
```

### Count rows per table (bulk)

```bash
sqlite3 data/projects-community.db "SELECT 'projects', COUNT(*) FROM projects UNION ALL SELECT 'decisions', COUNT(*) FROM decisions;"
```

### Readable table output

```bash
sqlite3 data/projects-community.db -header -column "SELECT * FROM projects LIMIT 10;"
```

## Distinguishing Real vs Test Data

Projects-community has extensive E2E auto-generated test data. Filter patterns:

| Pattern | Meaning | How to filter |
|---------|---------|---------------|
| `e2e:` prefix in idempotency_key | E2E test record | `WHERE idempotency_key NOT LIKE 'e2e:%'` |
| `smoke:` prefix in idempotency_key | MCP smoke test | `WHERE idempotency_key NOT LIKE 'smoke:%'` |
| Summary contains "E2E Test" / "Archive" / "Delete" | Auto-generated project | `WHERE summary NOT LIKE '%E2E Test%'` |
| No `owner_id` | Test data (no real owner) | `WHERE owner_id IS NOT NULL` |
| `growth_stage` = `seed` + auto name | Test project | Check manually by querying summary |
| `actor` = `hermes` without owner link | Auto-recorded observation | Check owner_id |
| `visibility` = empty or `test` | Test/synthetic data | `WHERE visibility IS NOT NULL AND visibility != 'test'` |

### Real projects (manually created, have owner_id)

| ID | Summary | Stage |
|----|---------|-------|
| `Z9CVm16qkFbDS619jzGH-` | Sample project | seedling |
| `5CWsQ8aJAUG-zhhIAOkDR` | Personal knowledge management system | sprouting |
| `8eOBObp9g4qrG4eU8-Zfz` | AI tool evaluation | growing |

### Real decisions (have meaningful question + candidates)

| ID | Question | Candidates |
|----|----------|------------|
| `XjJOH-ceWRbGF9vDgMAdd` | What tech stack for frontend? | Next.js + Tailwind |
| `zdcQ2BrRkRf5DpwrKo5_Q` | Notion, Obsidian, or Logseq? | Obsidian+plugins, Notion |
| `n0y-btzQmowTs-QAVYyeV` | Self-host or managed cloud? | deferred |
