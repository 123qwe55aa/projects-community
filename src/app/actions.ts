'use server';

import { nanoid } from 'nanoid';
import { and, eq, inArray, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getDatabase } from '@/db';
import {
  adoptionSnapshots,
  candidates,
  conversations,
  decisionLinks,
  decisions,
  messages,
  participants,
  pins,
  projects,
  researchJobs,
} from '@/db/schema';

export async function adoptCandidateAction(formData: FormData) {
  const decisionId = formData.get('decisionId') as string;
  const candidateId = formData.get('candidateId') as string;
  const candidateSummary = formData.get('candidateSummary') as string | null;
  const reasoning = formData.get('reasoning') as string | null;

  if (!decisionId || !candidateId || !reasoning?.trim()) {
    throw new Error('Decision ID, candidate ID, and reasoning are required');
  }

  const { sqlite } = getDatabase();

  const result = sqlite.transaction(function () {
    const candidateRow = sqlite
      .prepare('SELECT id, name, current_form_summary FROM candidates WHERE id = ?')
      .get(candidateId) as { id: string; name: string; current_form_summary: string | null } | undefined;

    if (!candidateRow) {
      throw new Error('Candidate not found');
    }

    const decisionRow = sqlite
      .prepare('SELECT id, project_id, state FROM decisions WHERE id = ?')
      .get(decisionId) as { id: string; project_id: string | null; state: string } | undefined;

    if (!decisionRow) {
      throw new Error('Decision not found');
    }

    const summary = candidateSummary?.trim() || candidateRow.current_form_summary || candidateRow.name;

    const currentAdoption = sqlite
      .prepare('SELECT id FROM adoption_snapshots WHERE decision_id = ? AND is_current = 1 LIMIT 1')
      .get(decisionId) as { id: string } | undefined;

    const newSnapshotId = nanoid();
    sqlite
      .prepare(
        `INSERT INTO adoption_snapshots (id, decision_id, candidate_id, project_id, candidate_summary, reasoning, is_current, adopted_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`
      )
      .run(newSnapshotId, decisionId, candidateId, decisionRow.project_id, summary, reasoning.trim());

    if (currentAdoption) {
      sqlite
        .prepare('UPDATE adoption_snapshots SET is_current = 0, superseded_by_id = ? WHERE id = ?')
        .run(newSnapshotId, currentAdoption.id);
    }

    sqlite
      .prepare("UPDATE decisions SET state = 'decided', updated_at = datetime('now') WHERE id = ?")
      .run(decisionId);

    if (decisionRow.project_id) {
      const projectDecisions = sqlite
        .prepare("SELECT state FROM decisions WHERE project_id = ?")
        .all(decisionRow.project_id) as { state: string }[];

      const decidedCount =
        projectDecisions.filter((d: { state: string }) => d.state === 'decided').length + 1;

      const stages = ['seed', 'seedling', 'growing', 'thriving', 'mature'];
      let newStage = 'seed';
      if (decidedCount >= 10) newStage = 'mature';
      else if (decidedCount >= 6) newStage = 'thriving';
      else if (decidedCount >= 3) newStage = 'growing';
      else if (decidedCount >= 1) newStage = 'seedling';

      const currentProject = sqlite
        .prepare('SELECT growth_stage FROM projects WHERE id = ?')
        .get(decisionRow.project_id) as { growth_stage: string } | undefined;

      const currentIdx = stages.indexOf(currentProject?.growth_stage ?? 'seed');
      const newIdx = stages.indexOf(newStage);
      if (newIdx > currentIdx) {
        sqlite
          .prepare("UPDATE projects SET growth_stage = ?, updated_at = datetime('now') WHERE id = ?")
          .run(newStage, decisionRow.project_id);
      }
    }

    return { snapshotId: newSnapshotId };
  }) as unknown as { snapshotId: string };

  revalidatePath(`/decisions/${decisionId}`);
  revalidatePath(`/decisions/${decisionId}/compare`);
  revalidatePath('/projects');
  revalidatePath('/map');

  return result;
}

export async function createProjectAction(formData: FormData) {
  const background = formData.get('background') as string | null;
  const buildingStyle = formData.get('buildingStyle') as string | null;

  if (!background?.trim()) {
    throw new Error('Background is required');
  }

  const { db } = getDatabase();
  const projectId = nanoid();
  const conversationId = nanoid();

  db.insert(projects).values({
    id: projectId,
    background: background.trim(),
    summary: background.trim().slice(0, 120),
    buildingStyle: buildingStyle || 'workshop',
    growthStage: 'seed',
    visibility: 'private',
  }).run();

  db.insert(conversations).values({
    id: conversationId,
    contextType: 'project',
    contextId: projectId,
  }).run();

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

  db.insert(decisions).values({
    id: decisionId,
    question: question.trim(),
    state: 'researching',
    scope: scope || 'project',
    projectId: projectId || null,
  }).run();

  if (projectId) {
    db.insert(decisionLinks).values({
      id: nanoid(),
      projectId,
      decisionId,
    }).run();
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
  db
    .update(decisions)
    .set({ state: newState, updatedAt: new Date() })
    .where(eq(decisions.id, decisionId))
    .run();

  revalidatePath('/decisions');
  revalidatePath(`/decisions/${decisionId}`);
}

export async function addCandidateAction(formData: FormData) {
  const decisionId = formData.get('decisionId') as string;
  const name = formData.get('name') as string;
  const summary = formData.get('summary') as string | null;

  if (!decisionId || !name.trim()) {
    throw new Error('Decision ID and candidate name are required');
  }

  const { db } = getDatabase();

  const id = nanoid();
  db.insert(candidates)
    .values({
      id,
      decisionId,
      name: name.trim(),
      currentFormSummary: summary?.trim() || null,
    })
    .run();

  revalidatePath(`/decisions/${decisionId}`);
  revalidatePath(`/decisions/${decisionId}/compare`);

  return { id };
}

export async function deleteProjectAction(projectId: string) {
  if (!projectId?.trim()) {
    throw new Error('Project ID is required');
  }

  const { db } = getDatabase();

  db.transaction((tx) => {
    const [project] = tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .all() as { id: string }[];

    if (!project) {
      throw new Error('Project not found');
    }

    const projectConversations = tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.contextType, 'project'),
          eq(conversations.contextId, projectId),
        ),
      )
      .all() as { id: string }[];
    const conversationIds = projectConversations.map((c) => c.id);

    if (conversationIds.length > 0) {
      const conversationMessages = tx
        .select({ id: messages.id })
        .from(messages)
        .where(inArray(messages.conversationId, conversationIds))
        .all() as { id: string }[];
      const messageIds = conversationMessages.map((m) => m.id);

      if (messageIds.length > 0) {
        tx.delete(pins).where(inArray(pins.messageId, messageIds)).run();
      }
      tx.delete(researchJobs).where(inArray(researchJobs.conversationId, conversationIds)).run();
      tx.delete(messages).where(inArray(messages.conversationId, conversationIds)).run();
      tx.delete(conversations).where(inArray(conversations.id, conversationIds)).run();
    }

    tx
      .update(decisions)
      .set({ projectId: null, scope: 'independent', updatedAt: new Date() })
      .where(eq(decisions.projectId, projectId))
      .run();
    tx.delete(decisionLinks).where(eq(decisionLinks.projectId, projectId)).run();
    tx
      .update(adoptionSnapshots)
      .set({ projectId: null })
      .where(eq(adoptionSnapshots.projectId, projectId))
      .run();
    tx.delete(participants).where(eq(participants.projectId, projectId)).run();
    tx.delete(projects).where(eq(projects.id, projectId)).run();
  });

  revalidatePath('/projects');
  revalidatePath('/decisions');
  revalidatePath('/map');

  return { redirectTo: '/projects' };
}

export async function deleteDecisionAction(decisionId: string) {
  if (!decisionId?.trim()) {
    throw new Error('Decision ID is required');
  }

  const { db } = getDatabase();
  let redirectTo = '/decisions';

  db.transaction((tx) => {
    const [decision] = tx
      .select({ id: decisions.id, projectId: decisions.projectId })
      .from(decisions)
      .where(eq(decisions.id, decisionId))
      .all() as { id: string; projectId: string | null }[];

    if (!decision) {
      throw new Error('Decision not found');
    }

    const [link] = tx
      .select({ projectId: decisionLinks.projectId })
      .from(decisionLinks)
      .where(eq(decisionLinks.decisionId, decisionId))
      .all() as { projectId: string | null }[];
    const projectId = decision.projectId || link?.projectId;
    if (projectId) {
      redirectTo = `/projects/${projectId}`;
    }

    const decisionCandidates = tx
      .select({ id: candidates.id })
      .from(candidates)
      .where(eq(candidates.decisionId, decisionId))
      .all() as { id: string }[];
    const candidateIds = decisionCandidates.map((c) => c.id);

    if (candidateIds.length > 0) {
      const candidateConversations = tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          or(
            and(eq(conversations.contextType, 'decision'), eq(conversations.contextId, decisionId)),
            and(eq(conversations.contextType, 'candidate'), inArray(conversations.contextId, candidateIds)),
          ),
        )
        .all() as { id: string }[];
      const conversationIds = candidateConversations.map((c) => c.id);

      if (conversationIds.length > 0) {
        const convMessages = tx
          .select({ id: messages.id })
          .from(messages)
          .where(inArray(messages.conversationId, conversationIds))
          .all() as { id: string }[];
        const messageIds = convMessages.map((m) => m.id);

        if (messageIds.length > 0) {
          tx.delete(pins).where(inArray(pins.messageId, messageIds)).run();
        }
        tx.delete(messages).where(inArray(messages.conversationId, conversationIds)).run();
        tx.delete(conversations).where(inArray(conversations.id, conversationIds)).run();
      }
      tx.delete(candidates).where(inArray(candidates.id, candidateIds)).run();
    }

    tx.delete(adoptionSnapshots).where(eq(adoptionSnapshots.decisionId, decisionId)).run();
    tx.delete(decisionLinks).where(eq(decisionLinks.decisionId, decisionId)).run();
    tx.delete(decisions).where(eq(decisions.id, decisionId)).run();
  });

  revalidatePath('/decisions');
  revalidatePath(redirectTo);

  return { redirectTo };
}

export async function pingAction() {
  return { ok: true };
}
