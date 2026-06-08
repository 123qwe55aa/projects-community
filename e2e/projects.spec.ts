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
    const titleInput = page.locator('input[name="title"], input[placeholder*="title" i]');
    await titleInput.fill('E2E Test Project');
    
    const descInput = page.locator('textarea[name="background"], textarea[placeholder*="background" i]');
    await descInput.fill('A project created by E2E tests');

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
});
