'use server';

import { revalidatePath } from 'next/cache';
import {
  archiveProject,
  confirmDecisionSuggestion,
  confirmObservation,
  correctLifecycle,
  dismissDecisionSuggestion,
  dismissHypothesis,
  ignoreObservation,
  mergeProjects,
  promoteHypothesis,
} from '@/lib/v2/governance';

export async function confirmObservationAction(formData: FormData) {
  const observationId = formText(formData, 'observationId');
  const projectId = formText(formData, 'projectId');
  await confirmObservation({ observationId, projectId });
  revalidateV2(projectId);
}

export async function ignoreObservationAction(formData: FormData) {
  await ignoreObservation(formText(formData, 'observationId'));
  revalidateV2();
}

export async function correctLifecycleAction(formData: FormData) {
  const projectId = formText(formData, 'projectId');
  const state = lifecycleState(formText(formData, 'state'));
  await correctLifecycle({
    projectId,
    state,
    rationale: formText(formData, 'rationale'),
  });
  revalidateV2(projectId);
}

export async function mergeProjectsAction(formData: FormData) {
  const sourceProjectId = formText(formData, 'sourceProjectId');
  const targetProjectId = formText(formData, 'targetProjectId');
  await mergeProjects({
    sourceProjectId,
    targetProjectId,
    rationale: formText(formData, 'rationale'),
  });
  revalidateV2(sourceProjectId, targetProjectId);
}

export async function archiveProjectAction(formData: FormData) {
  const projectId = formText(formData, 'projectId');
  await archiveProject({ projectId, rationale: formText(formData, 'rationale') });
  revalidateV2(projectId);
}

export async function confirmDecisionSuggestionAction(formData: FormData) {
  const projectId = formText(formData, 'projectId');
  await confirmDecisionSuggestion(formText(formData, 'eventId'));
  revalidateV2(projectId);
}

export async function dismissDecisionSuggestionAction(formData: FormData) {
  await dismissDecisionSuggestion(
    formText(formData, 'eventId'),
    formText(formData, 'rationale'),
  );
  revalidateV2(formText(formData, 'projectId'));
}

export async function promoteHypothesisAction(formData: FormData) {
  const projectId = await promoteHypothesis(formText(formData, 'hypothesisId'));
  revalidateV2(projectId);
}

export async function dismissHypothesisAction(formData: FormData) {
  await dismissHypothesis(
    formText(formData, 'hypothesisId'),
    formText(formData, 'rationale'),
  );
  revalidateV2();
}

function revalidateV2(...projectIds: string[]) {
  revalidatePath('/');
  revalidatePath('/attention');
  revalidatePath('/hypotheses');
  revalidatePath('/projects');
  for (const projectId of new Set(projectIds.filter(Boolean))) {
    revalidatePath(`/projects/${projectId}`);
  }
}

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function lifecycleState(value: string): 'active' | 'dormant' | 'ended' | 'archived' {
  if (value === 'active' || value === 'dormant' || value === 'ended' || value === 'archived') {
    return value;
  }
  throw new Error('state is invalid');
}
