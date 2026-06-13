import { test, expect } from '@playwright/test';

test.describe('Home / Landing Page', () => {
  test('shows the Hermes-first current-state dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Current Projects' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Needs Attention \(\d+\)$/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent Changes' })).toBeVisible();
    await expect(page.getByText('Hermes-first project observatory')).toBeVisible();
    await expect(page.getByRole('main')).toHaveCount(1);
  });

  test('shows the V2 primary navigation links', async ({ page }) => {
    await page.goto('/');
    const navigation = page.getByRole('navigation');
    await expect(navigation.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Needs Attention', exact: true })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Hypotheses', exact: true })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Projects', exact: true })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Projects Community home' })).toBeVisible();
  });

  test('Decisions remains reachable as a secondary link', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('link', { name: /Decisions/ }).click();
    await page.waitForURL('/decisions');
    await expect(page.locator('h1')).toContainText('Decisions');
  });

  test('Community Map remains reachable as a secondary link', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('link', { name: /Community Map/ }).click();
    await page.waitForURL('/map');
    await expect(page.locator('h1')).toContainText('Community Map');
  });

  test('has dark theme styling', async ({ page }) => {
    await page.goto('/');
    const body = page.locator('body');
    await expect(body).toHaveClass(/bg-zinc-950/);
  });
});
