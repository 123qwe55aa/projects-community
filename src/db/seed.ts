import { eq } from 'drizzle-orm';
import { getDatabase } from './index';
import { owners, projects, decisions, candidates, conversations } from './schema';
import { nanoid } from 'nanoid';

const DEFAULT_OWNER_ID = 'default-owner';

export async function seedDatabase() {
  const { db } = getDatabase();

  // Create default owner if not exists
  const existingOwner = db.select().from(owners).where(eq(owners.id, DEFAULT_OWNER_ID)).get();

  if (!existingOwner) {
    const now = new Date();

    // Default owner
    db.insert(owners).values({
      id: DEFAULT_OWNER_ID,
      createdAt: now,
    }).run();

    // Sample project
    const projectId = nanoid();
    db.insert(projects).values({
      id: projectId,
      ownerId: DEFAULT_OWNER_ID,
      background: 'A community research workspace for exploring and making decisions about technology, tools, and approaches.',
      summary: 'Sample project for getting started with Projects Community.',
      buildingStyle: 'studio',
      growthStage: 'seedling',
      visibility: 'private',
      createdAt: now,
      updatedAt: now,
    }).run();

    // Sample decision linked to the project
    const decisionId = nanoid();
    db.insert(decisions).values({
      id: decisionId,
      ownerId: DEFAULT_OWNER_ID,
      question: 'What technology stack should we use for the frontend?',
      state: 'researching',
      scope: 'project',
      projectId: projectId,
      visibility: 'private',
      createdAt: now,
      updatedAt: now,
    }).run();

    // Sample candidate for the decision
    const candidateId = nanoid();
    db.insert(candidates).values({
      id: candidateId,
      decisionId: decisionId,
      name: 'Next.js with Tailwind CSS',
      currentFormSummary: 'A full-stack React framework with built-in SSR and utility-first CSS.',
      createdAt: now,
      updatedAt: now,
    }).run();

    // Create a conversation for the candidate
    const conversationId = nanoid();
    db.insert(conversations).values({
      id: conversationId,
      contextType: 'candidate',
      contextId: candidateId,
      createdAt: now,
    }).run();

    console.log('Seed data created successfully.');
    console.log(`  Owner: ${DEFAULT_OWNER_ID}`);
    console.log(`  Project: ${projectId}`);
    console.log(`  Decision: ${decisionId}`);
    console.log(`  Candidate: ${candidateId}`);
    console.log(`  Conversation: ${conversationId}`);
  } else {
    console.log('Default owner already exists, skipping seed.');
  }
}