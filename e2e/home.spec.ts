import { test, expect } from '@playwright/test';

test.describe('Home / Landing Page', () => {
  test('loads with title and description', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Projects Community');
    await expect(page.locator('body')).toContainText('Local-first research workspace');
  });

  test('shows Projects, Decisions, and Map cards', async ({ page }) => {
    await page.goto('/');
    // Cards are divs with h3 inside a grid container
    const cards = page.locator('.grid.grid-cols-1 > div');
    await expect(cards).toHaveCount(3);
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Decisions', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Community Map', exact: true })).toBeVisible();
  });

  test('View Projects link navigates to /projects', async ({ page }) => {
    await page.goto('/');
    await page.click('text=View Projects');
    await page.waitForURL('/projects');
    await expect(page.locator('h1')).toContainText('Projects');
  });

  test('View Decisions link navigates to /decisions', async ({ page }) => {
    await page.goto('/');
    await page.click('text=View Decisions');
    await page.waitForURL('/decisions');
    await expect(page.locator('h1')).toContainText('Decisions');
  });

  test('Community Map link navigates to /map', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Community Map');
    await page.waitForURL('/map');
    await expect(page.locator('h1')).toContainText('Community Map');
  });

  test('has dark theme styling', async ({ page }) => {
    await page.goto('/');
    const body = page.locator('body');
    await expect(body).toHaveClass(/bg-zinc-950/);
  });
});
