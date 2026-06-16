import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  bindRepository: vi.fn(),
  setManualProjectType: vi.fn(),
  synchronizeAllProjectStatistics: vi.fn(),
  synchronizeProjectStatistics: vi.fn(),
}));

const cache = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/statistics/service', () => service);
vi.mock('next/cache', () => cache);

import {
  bindProjectRepositoryAction,
  setManualProjectTypeAction,
  synchronizeAllProjectStatisticsAction,
  synchronizeProjectStatisticsAction,
} from './statistics-actions';

describe('statistics actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.bindRepository.mockResolvedValue(undefined);
    service.setManualProjectType.mockResolvedValue(undefined);
    service.synchronizeProjectStatistics.mockResolvedValue({
      projectId: 'project-1',
      repoFullName: 'owner/repo',
      ok: true,
      error: null,
    });
    service.synchronizeAllProjectStatistics.mockResolvedValue([
      { projectId: 'project-1', repoFullName: 'owner/one', ok: true, error: null },
      { projectId: 'project-2', repoFullName: 'owner/two', ok: false, error: 'rate limited' },
    ]);
  });

  it('validates and delegates single-project synchronization before revalidating statistics and project paths', async () => {
    const result = await synchronizeProjectStatisticsAction(formData({
      projectId: ' project-1 ',
    }));

    expect(result).toMatchObject({ projectId: 'project-1', ok: true });
    expect(service.synchronizeProjectStatistics).toHaveBeenCalledWith('project-1');
    expect(cache.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      '/statistics',
      '/projects',
      '/projects/project-1',
      '/projects/project-1/statistics',
    ]);
  });

  it('rejects missing single-project synchronization project id without delegating', async () => {
    await expect(synchronizeProjectStatisticsAction(formData({ projectId: ' ' }))).rejects.toThrow(
      /projectId is required/,
    );

    expect(service.synchronizeProjectStatistics).not.toHaveBeenCalled();
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it('delegates all-project synchronization and revalidates overview, projects, and returned project detail paths', async () => {
    const result = await synchronizeAllProjectStatisticsAction();

    expect(result).toHaveLength(2);
    expect(service.synchronizeAllProjectStatistics).toHaveBeenCalledWith();
    expect(cache.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      '/statistics',
      '/projects',
      '/projects/project-1',
      '/projects/project-1/statistics',
      '/projects/project-2',
      '/projects/project-2/statistics',
    ]);
  });

  it('validates and delegates repository binding before revalidating relevant paths', async () => {
    await bindProjectRepositoryAction(formData({
      projectId: ' project-1 ',
      repoFullName: ' Owner/Repo ',
    }));

    expect(service.bindRepository).toHaveBeenCalledWith({
      projectId: 'project-1',
      repoFullName: 'Owner/Repo',
    });
    expect(cache.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      '/statistics',
      '/projects',
      '/projects/project-1',
      '/projects/project-1/statistics',
    ]);
  });

  it('rejects invalid repository binding values before delegating', async () => {
    await expect(bindProjectRepositoryAction(formData({
      projectId: 'project-1',
      repoFullName: '',
    }))).rejects.toThrow(/repoFullName is required/);

    expect(service.bindRepository).not.toHaveBeenCalled();
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it('sets, clears, and validates manual project type values', async () => {
    await setManualProjectTypeAction(formData({
      projectId: ' project-1 ',
      manualType: ' library ',
    }));
    await setManualProjectTypeAction(formData({
      projectId: 'project-2',
      manualType: ' ',
    }));

    expect(service.setManualProjectType).toHaveBeenNthCalledWith(1, {
      projectId: 'project-1',
      manualType: 'library',
    });
    expect(service.setManualProjectType).toHaveBeenNthCalledWith(2, {
      projectId: 'project-2',
      manualType: null,
    });
    expect(cache.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      '/statistics',
      '/projects',
      '/projects/project-1',
      '/projects/project-1/statistics',
      '/statistics',
      '/projects',
      '/projects/project-2',
      '/projects/project-2/statistics',
    ]);

    vi.clearAllMocks();
    await expect(setManualProjectTypeAction(formData({
      projectId: 'project-1',
      manualType: 'website',
    }))).rejects.toThrow(/manualType is invalid/);
    expect(service.setManualProjectType).not.toHaveBeenCalled();
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});

function formData(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}
