import { expect, test } from '@playwright/test';
import { nanoid } from 'nanoid';
import { getDatabase } from '../src/db';
import {
  githubStatisticsSnapshots,
  projects,
  projectStatistics,
} from '../src/db/schema';

test.describe('Statistics Manager', () => {
  test('shows portfolio statistics and project detail controls from local snapshots', async ({ page }) => {
    const seeded = seedStatisticsProject();

    await page.goto('/statistics');

    await expect(page.getByRole('heading', { name: 'Statistics' })).toBeVisible();
    await expect(page.getByLabel('Total Projects')).toBeVisible();
    await expect(page.getByLabel('GitHub Bound')).toContainText(/\d+/);
    await expect(page.getByLabel('30-Day Contributions')).toContainText(/\d+/);
    await expect(page.getByRole('heading', { name: 'Project Type Distribution' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent Activity Ranking' })).toBeVisible();
    await expect(page.getByRole('link', { name: seeded.summary })).toBeVisible();
    const overviewRow = page.getByRole('listitem').filter({ hasText: seeded.summary });
    await expect(overviewRow).toContainText(seeded.repoFullName);
    await expect(overviewRow).toContainText('11 commits · 4 PRs · 3 issues');
    await expect(overviewRow).toContainText('25');

    await page.getByRole('link', { name: seeded.summary }).click();
    await page.waitForURL(new RegExp(`/projects/${seeded.projectId}/statistics$`));

    await expect(
      page.getByRole('heading', { name: `${seeded.summary} Project Statistics` }),
    ).toBeVisible();
    await expect(page.getByLabel('Repository status')).toContainText(seeded.repoFullName);
    await expect(page.getByRole('heading', { name: 'Manage Project Statistics' })).toBeVisible();
    const metrics = page.locator('section[aria-labelledby="metrics-heading"]');
    await expect(metrics).toContainText('42 commits · 7 PRs · 5 issues · 13 stars');
    await expect(metrics).toContainText('11 commits · 4 PRs · 3 issues');

    await page.getByLabel('Project type').selectOption('tooling');
    await page.getByRole('button', { name: 'Save type' }).click();

    const classification = page.locator('section[aria-labelledby="type-heading"]');
    await expect(classification).toContainText('Manual type');
    await expect(classification).toContainText('Tooling');
  });
});

function seedStatisticsProject() {
  const key = nanoid().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const projectId = `stats-project-${key}`;
  const summary = `Statistics E2E Project ${key}`;
  const repoFullName = `owner/statistics-e2e-${key}`;
  const now = new Date();

  getDatabase().db.insert(projects).values({
    id: projectId,
    summary,
    background: 'A seeded Project for the Statistics Manager E2E journey.',
    buildingStyle: 'studio',
    growthStage: 'seed',
    visibility: 'private',
    createdAt: now,
    updatedAt: now,
  }).run();

  getDatabase().db.insert(projectStatistics).values({
    projectId,
    githubRepoFullName: repoFullName,
    inferredType: 'application',
    manualType: null,
    lastAttemptedAt: now,
    lastSuccessfulAt: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  }).run();

  getDatabase().db.insert(githubStatisticsSnapshots).values({
    projectId,
    repoFullName,
    repoUrl: `https://github.com/${repoFullName}`,
    primaryLanguage: 'TypeScript',
    topics: JSON.stringify(['nextjs', 'dashboard']),
    pushedAt: now,
    commitCount: 42,
    pullRequestCount: 7,
    issueCount: 5,
    starCount: 13,
    commits30d: 11,
    pullRequests30d: 4,
    issues30d: 3,
    activityScore30d: 25,
    updatedAt: now,
  }).run();

  return { projectId, summary, repoFullName };
}
