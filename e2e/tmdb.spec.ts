import { test, expect, type Page } from '@playwright/test';
import { setupContentScript, mockResponses } from './e2e-helpers';

const CARD = '#media-connector-tmdb-card';

const sentSearches = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __sentMessages: { type: string; payload?: unknown }[] }).__sentMessages
      .filter((m) => m.type === 'SEARCH_JELLYSEERR')
      .map((m) => m.payload),
  );

test.describe('TMDB — content script injection', () => {
  test('asks for the TV show by its TMDB id', async ({ page }) => {
    await setupContentScript(page, 'tmdb-tv.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrSeries('The Apothecary Diaries'),
    });

    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    await expect(card).toContainText("I've got this!");
    await expect(card).toContainText('The Apothecary Diaries');
    await expect(card.locator('button')).not.toHaveCount(0);
    expect(await sentSearches(page)).toEqual([
      { query: 'Монолог фармацевта', mediaType: 'tv', year: 2023, tmdbId: 220542 },
    ]);
  });

  test('asks for the movie by its TMDB id', async ({ page }) => {
    await setupContentScript(page, 'tmdb-movie.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrMovie('Your Name.'),
    });

    await expect(page.locator(CARD)).toContainText('Your Name.');
    expect(await sentSearches(page)).toEqual([
      { query: 'Твоё имя', mediaType: 'movie', year: 2016, tmdbId: 372058 },
    ]);
  });

  test('card sits under the header, above the cast', async ({ page }) => {
    await setupContentScript(page, 'tmdb-tv.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrSeries('The Apothecary Diaries'),
    });

    const card = page.locator(`.white_column > ${CARD}:first-child`);
    await expect(card).toBeVisible();
    const cardBox = await card.boundingBox();
    const headerBox = await page.locator('section.header').boundingBox();
    const castBox = await page.locator('section.top_billed').boundingBox();
    expect(cardBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(castBox!.y);
    // As wide as the panels under it.
    expect(Math.round(cardBox!.width)).toBe(Math.round(castBox!.width));
  });

  test('shows "No results" for an empty response', async ({ page }) => {
    await setupContentScript(page, 'tmdb-movie.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrEmpty,
    });

    await expect(page.locator(CARD)).toContainText('No results');
  });
});
