'use server';

import { nanoid } from 'nanoid';
import { getDatabase } from '@/db';
import { eq, and } from 'drizzle-orm';
import { projects, decisions, decisionLinks, conversations, candidates, adoptionSnapshots } from '@/db/schema';
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

export async function createCandidateAction(formData: FormData) {
  const decisionId = formData.get('decisionId') as string;
  const name = formData.get('name') as string;
  const summary = formData.get('summary') as string | null;

  if (!decisionId || !name?.trim()) {
    throw new Error('Decision ID and candidate name are required');
  }

  const { db } = getDatabase();
  const candidateId = nanoid();

  await db.insert(candidates).values({
    id: candidateId,
    decisionId,
    name: name.trim(),
    currentFormSummary: summary?.trim() || null,
  });

  revalidatePath(`/decisions/${decisionId}`);
  revalidatePath(`/decisions/${decisionId}/compare`);

  return { candidateId };
}

export async function adoptCandidateAction(formData: FormData) {
  const decisionId = formData.get('decisionId') as string;
  const candidateId = formData.get('candidateId') as string;
  const candidateSummary = formData.get('candidateSummary') as string | null;
  const reasoning = formData.get('reasoning') as string | null;

  if (!decisionId || !candidateId || !reasoning?.trim()) {
    throw new Error('Decision ID, candidate ID, and reasoning are required');
  }

  const { db } = getDatabase();

  // Use Drizzle transaction for atomicity
  const result = await db.transaction(async (tx) => {
    // 1. Fetch the candidate to get its summary
    const [candidate] = await tx
      .select()
      .from(candidates)
      .where(eq(candidates.id, candidateId));

    if (!candidate) {
      throw new Error('Candidate not found');
    }

    // 2. Fetch the decision to get projectId
    const [decision] = await tx
      .select()
      .from(decisions)
      .where(eq(decisions.id, decisionId));

    if (!decision) {
      throw new Error('Decision not found');
    }

    const summary = candidateSummary?.trim() || candidate.currentFormSummary || candidate.name;

    // 3. Find any current adoption for this decision
    const [currentAdoption] = await tx
      .select()
      .from(adoptionSnapshots)
      .where(
        and(
          eq(adoptionSnapshots.decisionId, decisionId),
          eq(adoptionSnapshots.isCurrent, true),
        ),
      );

    // 4. Create new adoption snapshot
    const newSnapshotId = nanoid();
    await tx.insert(adoptionSnapshots).values({
      id: newSnapshotId,
      decisionId,
      candidateId,
      projectId: decision.projectId || null,
      candidateSummary: summary,
      reasoning: reasoning.trim(),
      isCurrent: true,
      supersededById: null,
      adoptedAt: new Date(),
    });

    // 5. If there's a previous current adoption, supersede it with the new snapshot's id
    if (currentAdoption) {
      await tx
        .update(adoptionSnapshots)
        .set({
          isCurrent: false,
          supersededById: newSnapshotId,
        })
        .where(eq(adoptionSnapshots.id, currentAdoption.id));
    }

    // 6. Set decision state to 'decided'
    await tx
      .update(decisions)
      .set({ state: 'decided', updatedAt: new Date() })
      .where(eq(decisions.id, decisionId));

    // 7. Advance project growthStage based on number of decided decisions
    if (decision.projectId) {
      const projectDecisions = await tx
        .select({ state: decisions.state })
        .from(decisions)
        .where(eq(decisions.projectId, decision.projectId));

      // Count currently decided (including the one we just set)
      const decidedCount =
        projectDecisions.filter((d) => d.state === 'decided').length + 1;

      const stages = ['seed', 'seedling', 'growing', 'thriving', 'mature'];
      // Advance stage thresholds: 1 → seedling, 3 → growing, 6 → thriving, 10 → mature
      let newStage = 'seed';
      if (decidedCount >= 10) newStage = 'mature';
      else if (decidedCount >= 6) newStage = 'thriving';
      else if (decidedCount >= 3) newStage = 'growing';
      else if (decidedCount >= 1) newStage = 'seedling';

      // Only advance (never go backwards)
      const [currentProject] = await tx
        .select({ growthStage: projects.growthStage })
        .from(projects)
        .where(eq(projects.id, decision.projectId));

      const currentIdx = stages.indexOf(currentProject?.growthStage ?? 'seed');
      const newIdx = stages.indexOf(newStage);
      if (newIdx > currentIdx) {
        await tx
          .update(projects)
          .set({ growthStage: newStage, updatedAt: new Date() })
          .where(eq(projects.id, decision.projectId));
      }
    }

    return { snapshotId: newSnapshotId };
  });

  revalidatePath(`/decisions/${decisionId}`);
  revalidatePath(`/decisions/${decisionId}/compare`);
  // Project growthStage may have changed — revalidate project page too
  revalidatePath('/projects');
  revalidatePath('/map');

  return result;
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