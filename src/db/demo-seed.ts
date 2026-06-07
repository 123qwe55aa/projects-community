/**
 * Demo seed data — creates sample owner, projects, decisions,
 * candidates, and conversations for first-time users.
 * Idempotent: only inserts if the default owner doesn't exist.
 */
import { nanoid } from 'nanoid';
import { getDatabase, type DB } from './index';
import * as s from './schema';
import { eq } from 'drizzle-orm';

function db(): DB {
  return getDatabase().db;
}

function nid(): string {
  return nanoid();
}

function now(): Date {
  return new Date();
}

export async function seedDemoData(): Promise<void> {
  const existing = await db()
    .select()
    .from(s.owners)
    .where(eq(s.owners.id, 'default'));

  if (existing.length > 0) {
    console.log('[seed] Demo data already exists — skipping.');
    return;
  }

  console.log('[seed] Creating demo data...');

  // --- Owner ---
  await db().insert(s.owners).values({ id: 'default', createdAt: now() });

  // --- Project 1: Personal Knowledge Base ---
  const project1Id = nid();
  await db().insert(s.projects).values({
    id: project1Id,
    ownerId: 'default',
    background: 'Build a personal knowledge management system that captures research notes, bookmarks, and insights across multiple domains.',
    buildingStyle: 'studio',
    growthStage: 'sprouting',
    visibility: 'private',
    createdAt: now(),
    updatedAt: now(),
  });

  // --- Project 2: AI Tool Evaluation ---
  const project2Id = nid();
  await db().insert(s.projects).values({
    id: project2Id,
    ownerId: 'default',
    background: 'Compare and select AI coding tools for daily development workflow. Evaluate Codex, Claude Code, Cursor, and Copilot.',
    buildingStyle: 'workshop',
    growthStage: 'growing',
    visibility: 'private',
    createdAt: now(),
    updatedAt: now(),
  });

  // --- Decision 1: Knowledge base tool (linked to project 1) ---
  const decision1Id = nid();
  await db().insert(s.decisions).values({
    id: decision1Id,
    ownerId: 'default',
    question: 'Which tool should I use for my personal knowledge base — Notion, Obsidian, or Logseq?',
    state: 'researching',
    scope: 'project',
    dimensions: JSON.stringify(['Local-first / privacy', 'Extensibility & plugins', 'Search & linking', 'Mobile access', 'Cost']),
    weights: JSON.stringify({ 'Local-first / privacy': 5, 'Extensibility & plugins': 4, 'Search & linking': 4, 'Mobile access': 3, 'Cost': 3 }),
    projectId: project1Id,
    visibility: 'private',
    createdAt: now(),
    updatedAt: now(),
  });
  await db().insert(s.decisionLinks).values({
    id: nid(),
    projectId: project1Id,
    decisionId: decision1Id,
    createdAt: now(),
  });

  // Candidates for Decision 1
  const candidate1aId = nid();
  await db().insert(s.candidates).values({
    id: candidate1aId,
    decisionId: decision1Id,
    name: 'Obsidian + plugins',
    currentFormSummary: 'Local Markdown files, extensive plugin ecosystem, graph view, cross-platform with iCloud/Dropbox sync.',
    createdAt: now(),
    updatedAt: now(),
  });

  const candidate1bId = nid();
  await db().insert(s.candidates).values({
    id: candidate1bId,
    decisionId: decision1Id,
    name: 'Notion',
    currentFormSummary: 'Cloud-first, rich database views, team collaboration, templates, but no local-first and slow offline.',
    createdAt: now(),
    updatedAt: now(),
  });

  // --- Decision 2: Independent decision ---
  const decision2Id = nid();
  await db().insert(s.decisions).values({
    id: decision2Id,
    ownerId: 'default',
    question: 'Should I self-host my services or use managed cloud?',
    state: 'deferred',
    scope: 'independent',
    dimensions: JSON.stringify(['Cost', 'Maintenance overhead', 'Reliability', 'Learning value']),
    weights: JSON.stringify({ Cost: 5, 'Maintenance overhead': 3, Reliability: 4, 'Learning value': 3 }),
    visibility: 'private',
    createdAt: now(),
    updatedAt: now(),
  });

  // Candidate for Decision 2
  const candidate2aId = nid();
  await db().insert(s.candidates).values({
    id: candidate2aId,
    decisionId: decision2Id,
    name: 'Self-host with Docker on VPS',
    currentFormSummary: 'DigitalOcean $6/mo droplet, Docker Compose, full control, needs maintenance.',
    createdAt: now(),
    updatedAt: now(),
  });

  // --- Sample conversation (Decision 1, general) ---
  const conv1Id = nid();
  await db().insert(s.conversations).values({
    id: conv1Id,
    contextType: 'decision',
    contextId: decision1Id,
    createdAt: now(),
  });

  await db().insert(s.messages).values([
    {
      id: nid(),
      conversationId: conv1Id,
      role: 'user',
      content: 'I need to choose a knowledge base tool. I care most about local-first storage and privacy, but I also want good search and mobile access.',
      createdAt: now(),
    },
    {
      id: nid(),
      conversationId: conv1Id,
      role: 'assistant',
      content: 'That narrows things down. Notion is cloud-dependent, so if local-first is your top priority (weight: 5), the field is essentially Obsidian vs Logseq. Both store files locally as Markdown. Obsidian has a larger plugin ecosystem; Logseq is open-source with built-in outlining. Want me to add both as candidates for structured comparison?',
      createdAt: now(),
    },
  ]);

  // --- Sample conversation (Decision 2, candidate-scoped) ---
  const conv2Id = nid();
  await db().insert(s.conversations).values({
    id: conv2Id,
    contextType: 'candidate',
    contextId: candidate2aId,
    createdAt: now(),
  });

  await db().insert(s.messages).values([
    {
      id: nid(),
      conversationId: conv2Id,
      role: 'user',
      content: 'What are the real costs of self-hosting on a VPS vs managed cloud for a small project?',
      createdAt: now(),
    },
    {
      id: nid(),
      conversationId: conv2Id,
      role: 'assistant',
      content: 'For a small project (single app, low traffic): VPS costs $5-10/month flat (DigitalOcean, Hetzner, Aéza HK). Managed cloud (Railway, Fly.io, Vercel) is $0 on free tier but $20-50/month once you exceed limits. The break-even depends on how many services you run and whether you value zero-ops.',
      createdAt: now(),
    },
  ]);

  console.log('[seed] Demo data created — 2 projects, 2 decisions, 3 candidates, 2 conversations.');
}
