'use server';

import { nanoid } from 'nanoid';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getDatabase } from '@/db';
import {
  adoptionSnapshots,
  candidates,
  decisions,
  projects,
} from '@/db/schema';
import { getCurrentProjectSnapshot } from '@/lib/v2/projection/project';

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
    // 1. Fetch the candidate to get its summary
    const candidateRow = sqlite
      .prepare('SELECT id, name, current_form_summary FROM candidates WHERE id = ?')
      .get(candidateId) as { id: string; name: string; current_form_summary: string | null } | undefined;

    if (!candidateRow) {
      throw new Error('Candidate not found');
    }

    // 2. Fetch the decision to get projectId
    const decisionRow = sqlite
      .prepare('SELECT id, project_id, state FROM decisions WHERE id = ?')
      .get(decisionId) as { id: string; project_id: string | null; state: string } | undefined;

    if (!decisionRow) {
      throw new Error('Decision not found');
    }

    const summary = candidateSummary?.trim() || candidateRow.current_form_summary || candidateRow.name;

    // 3. Find any current adoption for this decision
    const currentAdoption = sqlite
      .prepare('SELECT id FROM adoption_snapshots WHERE decision_id = ? AND is_current = 1 LIMIT 1')
      .get(decisionId) as { id: string } | undefined;

    // 4. Create new adoption snapshot
    const newSnapshotId = nanoid();
    sqlite
      .prepare(
        `INSERT INTO adoption_snapshots (id, decision_id, candidate_id, project_id, candidate_summary, reasoning, is_current, adopted_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`
      )
      .run(newSnapshotId, decisionId, candidateId, decisionRow.project_id, summary, reasoning.trim());

    // 5. If there's a previous current adoption, supersede it
    if (currentAdoption) {
      sqlite
        .prepare('UPDATE adoption_snapshots SET is_current = 0, superseded_by_id = ? WHERE id = ?')
        .run(newSnapshotId, currentAdoption.id);
    }

    // 6. Set decision state to 'decided'
    sqlite
      .prepare("UPDATE decisions SET state = 'decided', updated_at = datetime('now') WHERE id = ?")
      .run(decisionId);

    // 7. Advance project growthStage based on number of decided decisions
    if (decisionRow.project_id) {
      const projectDecisions = sqlite
        .prepare("SELECT state FROM decisions WHERE project_id = ?")
        .all(decisionRow.project_id) as { state: string }[];

      // Count currently decided (including the one we just set)
      const decidedCount =
        projectDecisions.filter((d: { state: string }) => d.state === 'decided').length + 1;

      const stages = ['seed', 'seedling', 'growing', 'thriving', 'mature'];
      let newStage = 'seed';
      if (decidedCount >= 10) newStage = 'mature';
      else if (decidedCount >= 6) newStage = 'thriving';
      else if (decidedCount >= 3) newStage = 'growing';
      else if (decidedCount >= 1) newStage = 'seedling';

      // Only advance (never go backwards)
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



export async function createProjectAction(formData: FormData) {
  const background = formData.get('background') as string | null;
  const buildingStyle = formData.get('buildingStyle') as string | null;
  if (!background?.trim()) throw new Error('Background is required');

  const { db } = getDatabase();
  const projectId = nanoid();

  db.insert(projects).values({
    id: projectId,
    background: background.trim(),
    summary: background.trim().slice(0, 120),
    buildingStyle: buildingStyle || 'workshop',
    growthStage: 'seed',
    visibility: 'private',
  }).run();

  revalidatePath('/projects');
  revalidatePath(`/projects/${projectId}`);
  return { projectId };
}

export async function createDecisionAction(formData: FormData) {
  const question = formData.get('question') as string | null;
  const scope = formData.get('scope') as string | null;
  const projectId = formData.get('projectId') as string | null;
  if (!question?.trim()) throw new Error('Question is required');

  const { db } = getDatabase();
  const decisionId = nanoid();

  db.insert(decisions).values({
    id: decisionId,
    question: question.trim(),
    state: 'researching',
    scope: scope || 'project',
    projectId: projectId || null,
  }).run();

  revalidatePath('/projects');
  revalidatePath('/decisions');
  revalidatePath(`/decisions/${decisionId}`);
  return { decisionId };
}

export async function updateDecisionStateAction(formData: FormData) {
  const decisionId = formData.get('decisionId') as string;
  const newState = formData.get('state') as string;
  if (!decisionId || !newState) throw new Error('Decision ID and new state are required');

  const validStates = ['researching', 'deferred', 'decided', 'archived'];
  if (!validStates.includes(newState)) throw new Error('Invalid state');

  const { db } = getDatabase();
  db.update(decisions).set({ state: newState, updatedAt: new Date() }).where(eq(decisions.id, decisionId)).run();

  revalidatePath('/decisions');
  revalidatePath(`/decisions/${decisionId}`);
}

export async function deleteProjectAction(projectId: string) {
  const { sqlite } = getDatabase();
  sqlite.transaction(function () {
    const decisionRows = sqlite.prepare('SELECT id FROM decisions WHERE project_id = ?').all(projectId) as { id: string }[];
    for (const row of decisionRows) {
      sqlite.prepare('DELETE FROM candidates WHERE decision_id = ?').run(row.id);
      sqlite.prepare('DELETE FROM participants WHERE decision_id = ?').run(row.id);
      sqlite.prepare('DELETE FROM adoption_snapshots WHERE decision_id = ?').run(row.id);
      sqlite.prepare('DELETE FROM decision_links WHERE decision_id = ?').run(row.id);
      sqlite.prepare('DELETE FROM recommendations WHERE decision_id = ?').run(row.id);
    }
    sqlite.prepare('DELETE FROM decisions WHERE project_id = ?').run(projectId);
    sqlite.prepare('DELETE FROM participants WHERE project_id = ?').run(projectId);
    sqlite.prepare('DELETE FROM adoption_snapshots WHERE project_id = ?').run(projectId);
    sqlite.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  })();
  revalidatePath('/projects');
  revalidatePath('/map');
}

export async function deleteDecisionAction(decisionId: string) {
  const { sqlite } = getDatabase();
  sqlite.transaction(function () {
    sqlite.prepare('DELETE FROM candidates WHERE decision_id = ?').run(decisionId);
    sqlite.prepare('DELETE FROM participants WHERE decision_id = ?').run(decisionId);
    sqlite.prepare('DELETE FROM adoption_snapshots WHERE decision_id = ?').run(decisionId);
    sqlite.prepare('DELETE FROM decision_links WHERE decision_id = ?').run(decisionId);
    sqlite.prepare('DELETE FROM recommendations WHERE decision_id = ?').run(decisionId);
    sqlite.prepare('DELETE FROM decisions WHERE id = ?').run(decisionId);
  })();
  revalidatePath('/decisions');
  revalidatePath('/projects');
  revalidatePath('/map');
}

export async function pingAction() {
  return { ok: true };
}
