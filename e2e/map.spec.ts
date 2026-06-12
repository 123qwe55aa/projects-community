import { test, expect } from '@playwright/test';

test.describe('Community Map Page', () => {
  test('map page loads with heading', async ({ page }) => {
    await page.goto('/map');
    await expect(page.locator('h1')).toContainText('Community Map');
    await expect(page.locator('body')).toContainText('watch it grow');
  });

  test('map canvas is rendered', async ({ page }) => {
    await page.goto('/map');

    // Map either shows a canvas (when projects exist) or empty state
    const canvas = page.locator('canvas');
    const emptyState = page.getByText('Community is empty');
    
    // One of these should be visible
    const hasCanvas = await canvas.isVisible().catch(() => false);
    const isEmpty = await emptyState.isVisible().catch(() => false);
    
    expect(hasCanvas || isEmpty).toBeTruthy();
  });

  test('legend is visible', async ({ page }) => {
    await page.goto('/map');

    // Legend shows building styles and/or growth stages
    // Look for legend text or growth stage labels
    const legendArea = page.getByText(/seedling|sprouting|growing|mature/i).first();
    await expect(legendArea).toBeVisible({ timeout: 10000 });
  });
});
