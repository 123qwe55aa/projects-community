'use server';

import { revalidatePath } from 'next/cache';
import {
  bindRepository,
  setManualProjectType,
  synchronizeAllProjectStatistics,
  synchronizeProjectStatistics,
} from '@/lib/statistics/service';
import { PROJECT_TYPES, type ProjectType } from '@/lib/statistics/types';

export async function synchronizeProjectStatisticsAction(formData: FormData) {
  const projectId = formText(formData, 'projectId');
  const result = await synchronizeProjectStatistics(projectId);
  revalidateStatistics(projectId);
  return result;
}

export async function synchronizeAllProjectStatisticsAction() {
  const results = await synchronizeAllProjectStatistics();
  revalidateStatistics(...results.map((result) => result.projectId).filter(Boolean));
  return results;
}

export async function bindProjectRepositoryAction(formData: FormData) {
  const projectId = formText(formData, 'projectId');
  const repoFullName = formText(formData, 'repoFullName');
  await bindRepository({ projectId, repoFullName });
  revalidateStatistics(projectId);
}

export async function setManualProjectTypeAction(formData: FormData) {
  const projectId = formText(formData, 'projectId');
  const manualType = optionalProjectType(formData.get('manualType'));
  await setManualProjectType({ projectId, manualType });
  revalidateStatistics(projectId);
}

function revalidateStatistics(...projectIds: string[]) {
  revalidatePath('/statistics');
  revalidatePath('/projects');
  for (const projectId of new Set(projectIds.filter(Boolean))) {
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/statistics`);
  }
}

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function optionalProjectType(value: FormDataEntryValue | null): ProjectType | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error('manualType is invalid');

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!isProjectType(trimmed)) {
    throw new Error('manualType is invalid');
  }
  return trimmed;
}

function isProjectType(value: string): value is ProjectType {
  return PROJECT_TYPES.some((type) => type === value);
}
