import { test, expect } from '@playwright/test';
import { setupContentScript, mockResponses } from './e2e-helpers';

test.describe('Netflix — content script injection', () => {
  test('injects status indicator for a TV series', async ({ page }) => {
    await setupContentScript(page, 'netflix-series.html', {
      CHECK_MEDIA: mockResponses.checkMediaAvailable,
    });

    const indicator = page.locator('#media-connector-indicator');
    await expect(indicator).toBeAttached();
    await expect(indicator).toContainText('Available on Server');
  });

  test('injects status indicator for a movie', async ({ page }) => {
    await setupContentScript(page, 'netflix-movie.html', {
      CHECK_MEDIA: mockResponses.checkMediaAvailable,
    });

    const indicator = page.locator('#media-connector-indicator');
    await expect(indicator).toBeAttached();
    await expect(indicator).toContainText('Available on Server');
  });

  test('shows Request indicator for unavailable media', async ({ page }) => {
    await setupContentScript(page, 'netflix-series.html', {
      CHECK_MEDIA: mockResponses.checkMediaUnavailable,
    });

    const indicator = page.locator('#media-connector-indicator');
    await expect(indicator).toBeAttached();
    await expect(indicator).toContainText('Request with Jellyseerr');
  });

  test('shows Configure indicator when unconfigured', async ({ page }) => {
    await setupContentScript(page, 'netflix-series.html', {
      CHECK_MEDIA: mockResponses.checkMediaUnconfigured,
    });

    const indicator = page.locator('#media-connector-indicator');
    await expect(indicator).toBeAttached();
    await expect(indicator).toContainText('Configure Extension');
  });

  test('detects a series on the public title page with a country code', async ({ page }) => {
    await setupContentScript(page, 'netflix-public-series.html', {
      CHECK_MEDIA: mockResponses.checkMediaUnavailable,
    });

    const indicator = page.locator('#media-connector-indicator');
    await expect(indicator).toBeVisible();
    await expect(indicator).toContainText('Request with Jellyseerr');

    const sent = await page.evaluate(
      () =>
        (window as unknown as { __sentMessages: { type: string; payload: unknown }[] })
          .__sentMessages,
    );
    const payload = sent.find((m) => m.type === 'CHECK_MEDIA')?.payload as { year?: number };
    expect(payload).toMatchObject({ title: 'Stranger Things', mediaType: 'series' });
    // The page's 2025 is the latest season's year, so none is sent.
    expect(payload.year).toBeUndefined();
  });

  test('detects a movie and its year on the public title page', async ({ page }) => {
    await setupContentScript(page, 'netflix-public-movie.html', {
      CHECK_MEDIA: mockResponses.checkMediaAvailable,
    });

    const indicator = page.locator('#media-connector-indicator');
    await expect(indicator).toBeVisible();
    await expect(indicator).toContainText('Available on Server');

    const sent = await page.evaluate(
      () =>
        (window as unknown as { __sentMessages: { type: string; payload: unknown }[] })
          .__sentMessages,
    );
    expect(sent.find((m) => m.type === 'CHECK_MEDIA')?.payload).toMatchObject({
      title: 'Glass Onion: A Knives Out Mystery',
      year: 2022,
      mediaType: 'movie',
    });
  });

  test('indicator has close button', async ({ page }) => {
    await setupContentScript(page, 'netflix-movie.html', {
      CHECK_MEDIA: mockResponses.checkMediaAvailable,
    });

    const indicator = page.locator('#media-connector-indicator');
    await expect(indicator).toBeAttached();

    // Close button is the last child span with ×
    const closeBtn = indicator.locator('span:has-text("×")');
    await expect(closeBtn).toBeAttached();
  });
});
