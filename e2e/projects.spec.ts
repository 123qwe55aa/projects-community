import { test, expect } from '@playwright/test';

test.describe('Projects Page', () => {
  test('project list page loads with header', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('h1')).toContainText('Projects');
    await expect(page.locator('body')).toContainText('Organize your research');
  });

  test('can create a new project', async ({ page }) => {
    await page.goto('/projects');

    // Click the New Project button
    await page.getByRole('button', { name: /new project/i }).click();

    // Fill the form in the dialog
    const descInput = page.locator('textarea[name="background"], textarea[placeholder*="background" i]');
    await descInput.fill('E2E Test Project');

    // Submit
    await page.getByRole('button', { name: /create/i }).click();

    // Wait for the new project to appear in the list
    await expect(page.getByText('E2E Test Project')).toBeVisible({ timeout: 10000 });
  });

  test('clicking a project navigates to detail page', async ({ page }) => {
    await page.goto('/projects');

    // Click first project card link
    await page.locator('.grid a').first().click();
    await page.waitForURL(/\/projects\//);

    // Detail page should show project info and decision sections
    await expect(page.locator('h1')).toBeVisible();
  });

  test('can delete a project while preserving its decisions', async ({ page }) => {
    const projectName = `Delete Project ${Date.now()}`;
    const decisionQuestion = `Preserved Decision ${Date.now()}`;

    await page.goto('/projects');
    await page.getByRole('button', { name: /new project/i }).click();
    await page.locator('textarea[name="background"]').fill(projectName);
    await page.getByRole('button', { name: /create project/i }).click();
    await page.getByRole('link', { name: new RegExp(projectName) }).click();

    await page.getByRole('button', { name: /new decision/i }).click();
    await page.locator('input[name="question"]').fill(decisionQuestion);
    await page.getByRole('button', { name: /create decision/i }).click();
    await expect(page.getByRole('link', { name: new RegExp(decisionQuestion) }).first()).toBeVisible();

    await page.getByRole('button', { name: /delete project/i }).click();
    await expect(page.getByRole('dialog')).toContainText(projectName);
    await page.getByRole('button', { name: /delete project/i }).last().click();

    await page.waitForURL('/projects');
    await expect(page.getByText(projectName)).toHaveCount(0);

    await page.goto('/decisions');
    const preservedDecision = page.getByRole('link', { name: new RegExp(decisionQuestion) });
    await expect(preservedDecision).toBeVisible();
    await expect(preservedDecision).toContainText('Independent');
  });
});
