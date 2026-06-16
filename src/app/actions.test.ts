import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  bindRepositoryToUnboundProject: vi.fn(),
  createProjectFromGitHub: vi.fn(),
}));

const queries = vi.hoisted(() => ({
  getGitHubImportMatchSuggestions: vi.fn(),
}));

const cache = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

const database = vi.hoisted(() => ({
  getDatabase: vi.fn(() => ({
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          all: vi.fn(() => [
            {
              id: 'existing-project',
              summary: 'Existing project summary',
              background: 'Existing project background',
            },
          ]),
        })),
      })),
    },
  })),
}));

vi.mock('@/lib/statistics/service', () => service);
vi.mock('@/lib/statistics/queries', () => queries);
vi.mock('@/db', () => database);
vi.mock('next/cache', () => cache);

import {
  completeOneClickRepoImportAction,
  importOneClickRepoAction,
  previewOneClickRepoImportAction,
} from './actions';

describe('GitHub one-click import actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.bindRepositoryToUnboundProject.mockResolvedValue(undefined);
    service.createProjectFromGitHub.mockResolvedValue({ projectId: 'new-project' });
    queries.getGitHubImportMatchSuggestions.mockResolvedValue([
      {
        projectId: 'existing-project',
        score: 0.86,
        componentScores: {
          nameToSummary: 0.9,
          descriptionToSummary: 0.8,
          descriptionToBackground: 0.7,
        },
        matchReasons: ['Repository name matches project summary'],
      },
    ]);
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://api.github.com/repos/Owner/Repo/readme') {
        return new Response('README body', { status: 200 });
      }
      if (url === 'https://api.github.com/repos/Owner/Repo') {
        expect(init?.headers).toMatchObject({ 'User-Agent': 'projects-community' });
        return Response.json({
          name: 'Repo',
          full_name: 'Owner/Repo',
          description: 'A repository description',
          topics: ['typescript', 42, 'matching'],
          language: 'TypeScript',
          html_url: 'https://github.com/Owner/Repo',
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }));
  });

  it('previewOneClickRepoImportAction fetches repo metadata and returns match suggestions without creating or binding', async () => {
    const result = await previewOneClickRepoImportAction(' Owner/Repo ');

    expect(result.repo).toEqual({
      fullName: 'Owner/Repo',
      name: 'Repo',
      description: 'A repository description',
      topics: ['typescript', 'matching'],
      language: 'TypeScript',
      readmeText: 'README body',
      htmlUrl: 'https://github.com/Owner/Repo',
    });
    expect(queries.getGitHubImportMatchSuggestions).toHaveBeenCalledWith({
      name: 'Repo',
      description: 'A repository description',
    });
    expect(service.createProjectFromGitHub).not.toHaveBeenCalled();
    expect(service.bindRepositoryToUnboundProject).not.toHaveBeenCalled();
  });

  it('completeOneClickRepoImportAction binds an existing unbound project and revalidates without creating a project', async () => {
    const result = await completeOneClickRepoImportAction(formData({
      mode: 'bind-existing',
      fullName: ' Owner/Repo ',
      projectId: ' existing-project ',
    }));

    expect(result).toEqual({ projectId: 'existing-project', merged: true });
    expect(service.bindRepositoryToUnboundProject).toHaveBeenCalledWith({
      projectId: 'existing-project',
      repoFullName: 'Owner/Repo',
    });
    expect(service.createProjectFromGitHub).not.toHaveBeenCalled();
    expect(cache.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      '/projects',
      '/projects/existing-project',
    ]);
  });

  it('completeOneClickRepoImportAction creates a new project when requested and returns merged false', async () => {
    const result = await completeOneClickRepoImportAction(formData({
      mode: 'create-new',
      fullName: 'Owner/Repo',
      description: 'A repository description',
      topics: 'typescript, matching',
      language: 'TypeScript',
      readmeText: 'README body',
    }));

    expect(result).toEqual({ projectId: 'new-project', merged: false });
    expect(service.createProjectFromGitHub).toHaveBeenCalledWith({
      repoFullName: 'Owner/Repo',
      metadata: {
        description: 'A repository description',
        topics: ['typescript', 'matching'],
        language: 'TypeScript',
        readmeText: 'README body',
      },
    });
    expect(service.bindRepositoryToUnboundProject).not.toHaveBeenCalled();
    expect(cache.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      '/projects',
      '/projects/new-project',
    ]);
  });

  it('completeOneClickRepoImportAction validates bind-existing mode before delegating', async () => {
    await expect(completeOneClickRepoImportAction(formData({
      mode: 'bind-existing',
      fullName: 'Owner/Repo',
    }))).rejects.toThrow(/projectId is required/i);

    expect(service.bindRepositoryToUnboundProject).not.toHaveBeenCalled();
    expect(service.createProjectFromGitHub).not.toHaveBeenCalled();
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it('importOneClickRepoAction remains a create-new compatibility wrapper', async () => {
    const result = await importOneClickRepoAction(formData({ fullName: 'Owner/Repo' }));

    expect(result).toEqual({ projectId: 'new-project' });
    expect(service.createProjectFromGitHub).toHaveBeenCalledWith({
      repoFullName: 'Owner/Repo',
      metadata: {
        description: 'A repository description',
        topics: ['typescript', 'matching'],
        language: 'TypeScript',
        readmeText: 'README body',
      },
    });
  });
});

function formData(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}
