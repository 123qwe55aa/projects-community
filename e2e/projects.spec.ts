import { test, expect } from '@playwright/test';

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

    // Fill the form in the dialog
    const descInput = page.locator('textarea[name="background"], textarea[placeholder*="background" i]');
    await descInput.fill(projectName);

    // Submit
    await page.getByRole('button', { name: /create/i }).click();

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

  test('shows current snapshot and evidence timeline', async ({ page }) => {
    await page.goto('/projects');
    await page.locator('a[href^="/projects/"]').first().click();
    await expect(page.getByRole('heading', { name: 'Current State' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Evidence Timeline' })).toBeVisible();
  });

  test('archives a project with rationale while preserving its detail route', async ({ page }) => {
    const projectName = `Archive Project ${Date.now()}`;
    const rationale = 'The work has concluded and its evidence should remain available.';

    await page.goto('/projects');
    await page.getByRole('button', { name: /new project/i }).click();
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
