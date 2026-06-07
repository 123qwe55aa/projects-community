'use server';

import { nanoid } from 'nanoid';
import { getDatabase } from '@/db';
import { eq } from 'drizzle-orm';
import { projects, decisions, decisionLinks, conversations, candidates } from '@/db/schema';
import { revalidatePath } from 'next/cache';

export async function createProjectAction(formData: FormData) {
  const background = formData.get('background') as string | null;
  const buildingStyle = formData.get('buildingStyle') as string | null;

  if (!background?.trim()) {
    throw new Error('Background is required');
  }

  const { db } = getDatabase();
  const projectId = nanoid();
  const conversationId = nanoid();

  await db.insert(projects).values({
    id: projectId,
    background: background.trim(),
    summary: background.trim().slice(0, 120),
    buildingStyle: buildingStyle || 'workshop',
    growthStage: 'seed',
    visibility: 'private',
  });

  // Auto-create a conversation for the project
  await db.insert(conversations).values({
    id: conversationId,
    contextType: 'project',
    contextId: projectId,
  });

  revalidatePath('/projects');
  revalidatePath(`/projects/${projectId}`);

  return { projectId };
}

export async function createDecisionAction(formData: FormData) {
  const question = formData.get('question') as string | null;
  const scope = formData.get('scope') as string | null;
  const projectId = formData.get('projectId') as string | null;

  if (!question?.trim()) {
    throw new Error('Question is required');
  }

  const { db } = getDatabase();
  const decisionId = nanoid();

  await db.insert(decisions).values({
    id: decisionId,
    question: question.trim(),
    state: 'researching',
    scope: scope || 'project',
    projectId: projectId || null,
  });

  // Link decision to project if projectId provided
  if (projectId) {
    await db.insert(decisionLinks).values({
      id: nanoid(),
      projectId,
      decisionId,
    });
  }

  revalidatePath('/projects');
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/decisions');
  revalidatePath(`/decisions/${decisionId}`);

  return { decisionId };
}

export async function updateDecisionStateAction(formData: FormData) {
  const decisionId = formData.get('decisionId') as string;
  const newState = formData.get('state') as string;

  if (!decisionId || !newState) {
    throw new Error('Decision ID and new state are required');
  }

  const validStates = ['researching', 'deferred', 'decided', 'archived'];
  if (!validStates.includes(newState)) {
    throw new Error('Invalid state');
  }

  const { db } = getDatabase();
  await db
    .update(decisions)
    .set({ state: newState, updatedAt: new Date() })
    .where(eq(decisions.id, decisionId));

  revalidatePath('/decisions');
  revalidatePath(`/decisions/${decisionId}`);
}

export async function addCandidateAction(formData: FormData) {
  const decisionId = formData.get('decisionId') as string;
  const name = formData.get('name') as string;
  const summary = formData.get('summary') as string | null;

  if (!decisionId || !name?.trim()) {
    throw new Error('Decision ID and candidate name are required');
  }

  const { db: dbConn } = getDatabase();
  const candidateId = nanoid();

  await dbConn.insert(candidates).values({
    id: candidateId,
    decisionId,
    name: name.trim(),
    currentFormSummary: summary?.trim() || null,
  });

  revalidatePath(`/decisions/${decisionId}`);
}