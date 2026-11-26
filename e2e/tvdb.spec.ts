import { test, expect, type Page } from '@playwright/test';
import { setupContentScript, mockResponses } from './e2e-helpers';

const CARD = '#media-connector-tvdb-card';

const sentSearches = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __sentMessages: { type: string; payload?: unknown }[] }).__sentMessages
      .filter((m) => m.type === 'SEARCH_JELLYSEERR')
      .map((m) => m.payload),
  );

test.describe('TheTVDB — content script injection', () => {
  test('asks for the series by the TMDB id it links', async ({ page }) => {
    await setupContentScript(page, 'tvdb-series.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrSeries('The Apothecary Diaries'),
    });

    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    await expect(card).toContainText("I've got this!");
    await expect(card).toContainText('The Apothecary Diaries');
    await expect(card.locator('button')).not.toHaveCount(0);
    expect(await sentSearches(page)).toEqual([
      { query: 'The Apothecary Diaries', mediaType: 'tv', year: 2023, tmdbId: 220542 },
    ]);
  });

  test('asks for the movie by the TMDB id it links', async ({ page }) => {
    await setupContentScript(page, 'tvdb-movie.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrMovie('Your Name.'),
    });

    await expect(page.locator(CARD)).toContainText('Your Name.');
    expect(await sentSearches(page)).toEqual([
      { query: 'your name.', mediaType: 'movie', year: 2016, tmdbId: 372058 },
    ]);
  });

  test('searches by name and year without a TMDB link', async ({ page }) => {
    await setupContentScript(page, 'tvdb-series-no-tmdb.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrEmpty,
    });

    await expect(page.locator(CARD)).toContainText('No results');
    expect(await sentSearches(page)).toEqual([
      { query: 'Some Local Show', mediaType: 'tv', year: 2024 },
    ]);
  });

  test('card sits under the title block, above the tabs', async ({ page }) => {
    await setupContentScript(page, 'tvdb-series.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrSeries('The Apothecary Diaries'),
    });

    const card = page.locator(`.row.mt-2 + ${CARD}`);
    await expect(card).toBeVisible();
    const cardBox = await card.boundingBox();
    const titleBox = await page.locator('.row.mt-2').boundingBox();
    const tabsBox = await page.locator('.nav-tabs').boundingBox();
    expect(cardBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height);
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(tabsBox!.y);
  });
});
