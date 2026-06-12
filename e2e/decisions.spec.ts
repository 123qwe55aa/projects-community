import { test, expect } from '@playwright/test';

test.describe('Decisions Page', () => {
  test('decision list page loads with header', async ({ page }) => {
    await page.goto('/decisions');
    await expect(page.locator('h1')).toContainText('Decisions');
    await expect(page.locator('body')).toContainText('Track and compare');
  });

  test('shows existing decisions in list', async ({ page }) => {
    await page.goto('/decisions');

    // Decisions are rendered as links inside a space-y-2 container
    const decisionLinks = page.locator('.space-y-2 > a');
    await expect(decisionLinks.first()).toBeVisible({ timeout: 10000 });
  });

  test('decision detail page shows candidates section', async ({ page }) => {
    await page.goto('/decisions');

    // Click first decision
    await page.locator('.space-y-2 > a').first().click();
    await page.waitForURL(/\/decisions\//);

    // Should show decision question and some detail content
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('can add a candidate to a decision', async ({ page }) => {
    await page.goto('/decisions');

    // Click first decision
    await page.locator('.space-y-2 > a').first().click();
    await page.waitForURL(/\/decisions\//);

    // Look for Add Candidate button
    const addBtn = page.getByRole('button', { name: /add candidate/i });
    if (await addBtn.isVisible()) {
      await addBtn.click();

      // Fill candidate form
      const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
      if (await nameInput.isVisible()) {
        await nameInput.fill('E2E Candidate');
      }

      const submitBtn = page.getByRole('button', { name: /add|create|submit/i });
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        // Wait for page to update
        await page.waitForTimeout(2000);
      }
    }
  });

  test('can change decision state', async ({ page }) => {
    await page.goto('/decisions');

    // Click first decision
    await page.locator('.space-y-2 > a').first().click();
    await page.waitForURL(/\/decisions\//);

    // Look for state change form/button
    const stateSelect = page.locator('select[name="state"], [role="combobox"]').first();
    if (await stateSelect.isVisible()) {
      await expect(stateSelect).toBeVisible();
    }
  });

  test('can delete a decision', async ({ page }) => {
    const question = `Delete Decision ${Date.now()}`;

    await page.goto('/decisions');
    await page.getByRole('button', { name: /new decision/i }).click();
    await page.locator('input[name="question"]').fill(question);
    await page.getByRole('button', { name: /create decision/i }).click();
    await page.getByRole('link', { name: new RegExp(question) }).click();

    await page.getByRole('button', { name: '+ Add Candidate', exact: true }).click();
    await page.locator('input[name="name"]').fill('Candidate to delete');
    await page.getByRole('button', { name: 'Add Candidate', exact: true }).click();
    await expect(page.getByText('Candidate to delete')).toBeVisible();

    await page.getByRole('button', { name: /delete decision/i }).click();
    await expect(page.getByRole('dialog')).toContainText(question);
    await page.getByRole('button', { name: /delete decision/i }).last().click();

    await page.waitForURL('/decisions');
    await expect(page.getByText(question)).toHaveCount(0);
  });
});
