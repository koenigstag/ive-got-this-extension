import { test, expect, type Page } from '@playwright/test';
import { setupContentScript, mockResponses } from './e2e-helpers';

/** The messages the content script sent, of one type. */
const sentOfType = async (page: Page, type: string) =>
  (
    await page.evaluate(
      () =>
        (window as unknown as { __sentMessages: { type: string; payload: unknown }[] })
          .__sentMessages,
    )
  )
    .filter((m) => m.type === type)
    .map((m) => m.payload);

const dialogOf = (page: Page) => page.locator('#media-connector-dialog-host dialog');

test.describe('Media dialog from the cards on other sites', () => {
  test('Google sidebar: Request opens the dialog, and the dialog requests', async ({ page }) => {
    await setupContentScript(page, 'google-movie.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrMovie('The Matrix', 'not_requested'),
      GET_MEDIA_DETAILS: mockResponses.mediaDetailsMovie,
      REQUEST_MEDIA: mockResponses.requestMediaSuccess,
    });

    await page
      .locator('#media-connector-sidebar')
      .getByRole('button', { name: /Request/ })
      .click();

    const dialog = dialogOf(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('The Matrix');
    await expect(dialog).toContainText('Not on Emby');
    expect(await sentOfType(page, 'GET_MEDIA_DETAILS')).toEqual([
      { title: 'The Matrix', year: 1999, tmdbId: '603', mediaType: 'movie' },
    ]);
    // The click on the sidebar only opened the dialog.
    expect(await sentOfType(page, 'REQUEST_MEDIA')).toEqual([]);

    await dialog.getByRole('button', { name: 'Request', exact: true }).click();
    await expect(dialog).toContainText('Request submitted.');
    expect(await sentOfType(page, 'REQUEST_MEDIA')).toEqual([
      expect.objectContaining({ tmdbId: '603', mediaType: 'movie' }),
    ]);

    await page.keyboard.press('Escape');
    await expect(page.locator('#media-connector-dialog-host')).toHaveCount(0);
  });

  test('Yandex sidebar: Manage in Jellyseerr opens the dialog with the seasons', async ({
    page,
  }) => {
    await setupContentScript(page, 'yandex-series.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrSeries('Breaking Bad'),
      GET_MEDIA_DETAILS: mockResponses.mediaDetailsSeries,
    });

    await page
      .locator('#media-connector-sidebar')
      .getByRole('button', { name: /Manage in Jellyseerr/ })
      .click();

    const dialog = dialogOf(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('7 of 7 on the server');
    await expect(dialog.locator('.seasons input')).toHaveCount(3);
    expect(await sentOfType(page, 'GET_MEDIA_DETAILS')).toEqual([
      { title: 'Breaking Bad', year: 2008, tmdbId: '1396', mediaType: 'series' },
    ]);
    expect(await sentOfType(page, 'OPEN_TAB')).toEqual([]);
  });

  test('IMDb card: Request opens the dialog instead of requesting', async ({ page }) => {
    await setupContentScript(page, 'imdb-movie.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrMovie('The Matrix', 'not_requested'),
      GET_MEDIA_DETAILS: mockResponses.mediaDetailsMovie,
    });

    await page
      .getByRole('button', { name: /Request/ })
      .first()
      .click();

    await expect(dialogOf(page)).toBeVisible();
    expect(await sentOfType(page, 'GET_MEDIA_DETAILS')).toEqual([
      expect.objectContaining({ tmdbId: '603', mediaType: 'movie' }),
    ]);
    expect(await sentOfType(page, 'REQUEST_MEDIA')).toEqual([]);
  });

  test('Netflix indicator: Request with Jellyseerr opens the dialog for the page title', async ({
    page,
  }) => {
    await setupContentScript(page, 'netflix-public-series.html', {
      CHECK_MEDIA: mockResponses.checkMediaUnavailable,
      GET_MEDIA_DETAILS: mockResponses.mediaDetailsSeries,
    });

    const indicator = page.locator('#media-connector-indicator');
    await expect(indicator).toBeVisible();
    await indicator.click();

    await expect(dialogOf(page)).toBeVisible();
    expect(await sentOfType(page, 'GET_MEDIA_DETAILS')).toEqual([
      expect.objectContaining({ title: 'Stranger Things', mediaType: 'series' }),
    ]);
    expect(await sentOfType(page, 'REQUEST_MEDIA')).toEqual([]);
  });
});
