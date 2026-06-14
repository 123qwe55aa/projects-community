import { test, expect } from '@playwright/test';
import { nanoid } from 'nanoid';
import { getDatabase } from '../src/db';
import { projects, signalEvidence, signals } from '../src/db/schema';
import { mergeProjects } from '../src/lib/v2/governance';
import { recordObservation, recordProjectEvent } from '../src/lib/v2/ingestion';
import { projectProject } from '../src/lib/v2/projection/project';

test.describe('Projects Page', () => {
  test('project list page loads with header', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('h1')).toContainText('Projects');
    await expect(page.locator('body')).toContainText('Organize your research');
  });

  test('can create a new project', async ({ page }) => {
    const projectName = `E2E Test Project ${Date.now()}`;
    await page.goto('/projects');

    // Click the New Project button
    await page.getByRole('button', { name: /new project/i }).click();

    // Dismiss template picker — start from scratch
    await page.getByRole('button', { name: /start from scratch/i }).click();

    // Fill the form in the dialog
    const descInput = page.locator('textarea[name="background"], textarea[placeholder*="background" i]');
    await descInput.fill(projectName);

    // Submit
    await page.getByRole('button', { name: /create project/i }).click();

    // Wait for the new project to appear in the list
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10000 });
  });

  test('clicking a project navigates to detail page', async ({ page }) => {
    await page.goto('/projects');

    // Click first project card link
    await page.locator('.grid a').first().click();
    await page.waitForURL(/\/projects\//);

    // Detail page should show project info and decision sections
    await expect(page.locator('h1')).toBeVisible();
  });

  test('shows seeded Hermes evidence and corrects lifecycle from the current state', async ({ page }) => {
    const projectId = await seedEvidenceProject();
    const correctionRationale = 'The seeded review confirms this work has ended.';

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByRole('heading', { name: 'Current State' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Evidence Timeline' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Related Projects' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Related Signals' })).toBeVisible();
    const evidenceTimeline = page.getByLabel('Evidence Timeline');
    await expect(evidenceTimeline.locator('blockquote')).toContainText(
      'Hermes says the evidence timeline is ready.',
    );
    await expect(
      evidenceTimeline.getByText('Hermes source: e2e:conversation / e2e:message', { exact: true }),
    ).toBeVisible();

    const lifecycleState = page.getByLabel('Lifecycle state');
    await expect(lifecycleState).toHaveValue('dormant');
    await lifecycleState.selectOption('ended');
    await page.getByLabel('Lifecycle rationale').fill(correctionRationale);
    await page.getByRole('button', { name: 'Update Lifecycle' }).click();

    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));
    await expect(page.getByLabel('Current State').getByText('ended', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Current State').getByText(correctionRationale, { exact: true })).toBeVisible();
  });

  test('shows populated direct Project relationships and related Signals', async ({ page }) => {
    const key = nanoid();
    const projectName = `Relationship Project ${key}`;
    const relatedProjectName = `Direct Evidence Project ${key}`;
    const signalTitle = `Relationship Signal ${key}`;
    const projectId = seedProject(projectName, 'Project with populated relationships.');
    const relatedProjectId = seedProject(relatedProjectName, 'Project sharing direct evidence.');
    const observation = await recordObservation({
      idempotencyKey: `e2e:relationship-observation:${key}`,
      summary: 'A direct observation connects both Projects',
      type: 'progress',
      sourceConversationRef: `e2e:relationship-conversation:${key}`,
      sourceMessageRef: `e2e:relationship-message:${key}`,
      sourceQuote: 'This observation directly supports both Projects.',
      observedAt: new Date().toISOString(),
    });
    await recordProjectEvent({
      idempotencyKey: `e2e:relationship-event:${key}:primary`,
      projectId,
      eventType: 'progress_recorded',
      payload: { summary: 'Primary relationship evidence' },
      rationale: 'Seed a populated relationship view.',
      evidenceObservationIds: [observation.observationId],
      occurredAt: new Date().toISOString(),
    });
    await recordProjectEvent({
      idempotencyKey: `e2e:relationship-event:${key}:related`,
      projectId: relatedProjectId,
      eventType: 'progress_recorded',
      payload: { summary: 'Related relationship evidence' },
      rationale: 'Share the same direct observation.',
      evidenceObservationIds: [observation.observationId],
      occurredAt: new Date().toISOString(),
    });
    const signalId = nanoid();
    getDatabase().db.insert(signals).values({
      id: signalId,
      stableKey: `e2e:relationship-signal:${key}`,
      title: signalTitle,
      description: 'A populated related Signal.',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).run();
    getDatabase().db.insert(signalEvidence).values({
      id: nanoid(),
      signalId,
      observationId: observation.observationId,
    }).run();

    await page.goto(`/projects/${projectId}`);

    await expect(page.getByRole('link', { name: relatedProjectName })).toBeVisible();
    await expect(page.getByText('shared evidence', { exact: true })).toBeVisible();
    await expect(page.getByText('1 shared evidence', { exact: true })).toBeVisible();
    await expect(page.getByText(signalTitle, { exact: true })).toBeVisible();
    await expect(page.getByText('1 supporting observation', { exact: true })).toBeVisible();
  });

  test('shows merged sources as read-only and excludes them from merge targets', async ({ page }) => {
    const key = nanoid();
    const sourceName = `Merged Source ${key}`;
    const targetName = `Merge Destination ${key}`;
    const writableName = `Writable Project ${key}`;
    const sourceProjectId = seedProject(sourceName, 'Historical merged source.');
    const targetProjectId = seedProject(targetName, 'Writable merge destination.');
    const writableProjectId = seedProject(writableName, 'Another writable Project.');
    await mergeProjects({
      sourceProjectId,
      targetProjectId,
      rationale: 'Seed a merged read-only source for E2E.',
    });

    await page.goto(`/projects/${sourceProjectId}`);

    const readOnlyStatus = page.getByLabel('Read-only merged Project');
    await expect(readOnlyStatus).toContainText('Read-only merged Project');
    await expect(readOnlyStatus.getByRole('link', { name: targetName })).toHaveAttribute(
      'href',
      `/projects/${targetProjectId}`,
    );
    await expect(page.getByRole('button', { name: 'Update Lifecycle' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Merge Project' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Archive Project' })).toHaveCount(0);

    await page.goto(`/projects/${writableProjectId}`);
    const mergeTargetOptions = await page.getByLabel('Merge into').locator('option').allTextContents();
    expect(mergeTargetOptions).not.toContain(sourceName);
    expect(mergeTargetOptions).toContain(targetName);
  });

  test('archives a project with rationale while preserving its detail route', async ({ page }) => {
    const projectName = `Archive Project ${Date.now()}`;
    const rationale = 'The work has concluded and its evidence should remain available.';

    await page.goto('/projects');
    await page.getByRole('button', { name: /new project/i }).click();
    await page.getByRole('button', { name: /start from scratch/i }).click();
    await page.locator('textarea[name="background"]').fill(projectName);
    await page.getByRole('button', { name: /create project/i }).click();
    await page.getByRole('link', { name: new RegExp(projectName) }).click();
    await page.waitForURL(/\/projects\/[^/]+$/);
    const projectRoute = new URL(page.url()).pathname;

    const archiveRationale = page.getByLabel('Archive rationale');
    await expect(archiveRationale).toHaveAttribute('required', '');
    await archiveRationale.fill(rationale);
    await page.getByRole('button', { name: 'Archive Project' }).click();

    await expect(page).toHaveURL(new RegExp(`${projectRoute}$`));
    const currentState = page.getByLabel('Current State');
    await expect(currentState.getByRole('heading', { name: 'Current State' })).toBeVisible();
    await expect(currentState.getByText('archived', { exact: true })).toBeVisible();
    await expect(currentState.getByText(rationale, { exact: true })).toBeVisible();
  });
});

async function seedEvidenceProject() {
  const key = nanoid();
  const projectId = seedProject(
    `Evidence Project ${key}`,
    'An E2E Project with seeded Hermes evidence.',
  );
  const observation = await recordObservation({
    idempotencyKey: `e2e:observation:${key}`,
    summary: 'Evidence timeline is ready',
    type: 'progress',
    sourceConversationRef: 'e2e:conversation',
    sourceMessageRef: 'e2e:message',
    sourceQuote: 'Hermes says the evidence timeline is ready.',
    observedAt: new Date().toISOString(),
  });
  await recordProjectEvent({
    idempotencyKey: `e2e:event:${key}`,
    projectId,
    eventType: 'lifecycle_inferred',
    payload: { state: 'dormant', rationale: 'Waiting for the seeded review.' },
    rationale: 'Waiting for the seeded review.',
    evidenceObservationIds: [observation.observationId],
    occurredAt: new Date().toISOString(),
  });
  await projectProject(projectId);
  return projectId;
}

function seedProject(summary: string, background: string) {
  const projectId = nanoid();
  getDatabase().db.insert(projects).values({
    id: projectId,
    summary,
    background,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).run();
  return projectId;
}
