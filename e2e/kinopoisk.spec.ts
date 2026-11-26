import { test, expect, type Page } from '@playwright/test';
import { setupContentScript, mockResponses } from './e2e-helpers';

const CARD = '#media-connector-kinopoisk-card';

const sentSearches = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __sentMessages: { type: string; payload?: unknown }[] }).__sentMessages
      .filter((m) => m.type === 'SEARCH_JELLYSEERR')
      .map((m) => m.payload),
  );

test.describe('Kinopoisk — content script injection', () => {
  test('injects card for a film, searched by its original title', async ({ page }) => {
    await setupContentScript(page, 'kinopoisk-movie.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrMovie('The Matrix'),
    });

    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    await expect(card).toContainText("I've got this!");
    await expect(card).toContainText('The Matrix');
    await expect(card.locator('button')).not.toHaveCount(0);
    expect(await sentSearches(page)).toEqual([
      { query: 'The Matrix', mediaType: 'movie', year: 1999 },
    ]);
  });

  test('injects card for a series', async ({ page }) => {
    await setupContentScript(page, 'kinopoisk-series.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrSeries('Breaking Bad'),
    });

    await expect(page.locator(CARD)).toContainText('Breaking Bad');
    expect(await sentSearches(page)).toEqual([
      { query: 'Breaking Bad', mediaType: 'tv', year: 2008 },
    ]);
  });

  test('searches a Russian film by its Russian title', async ({ page }) => {
    await setupContentScript(page, 'kinopoisk-russian.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrEmpty,
    });

    await expect(page.locator(CARD)).toContainText('No results');
    expect(await sentSearches(page)).toEqual([{ query: 'Брат', mediaType: 'movie', year: 1997 }]);
  });

  test('card sits under the title and the buttons, above "О фильме"', async ({ page }) => {
    await setupContentScript(page, 'kinopoisk-movie.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrMovie('The Matrix'),
    });

    const card = page.locator(`.styles_header > ${CARD}:last-child`);
    await expect(card).toBeVisible();
    const cardBox = await card.boundingBox();
    const buttonsBox = await page.locator('.styles_root_buttons').boundingBox();
    const aboutBox = await page.locator('.film-page-section-title').boundingBox();
    expect(cardBox!.y).toBeGreaterThanOrEqual(buttonsBox!.y + buttonsBox!.height);
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(aboutBox!.y);
  });

  test('follows in-app navigation to another title', async ({ page }) => {
    await setupContentScript(page, 'kinopoisk-movie.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrMovie('The Matrix'),
    });
    await expect(page.locator(CARD)).toBeVisible();

    // Kinopoisk changes the URL first, the page and its JSON-LD a moment later.
    await page.evaluate(() => {
      history.pushState({}, '', '/film/41519/');
      setTimeout(() => {
        document.querySelector('script[type="application/ld+json"]')!.textContent = JSON.stringify({
          '@type': 'Movie',
          name: 'Брат',
          datePublished: '1997',
          url: 'https://www.kinopoisk.ru/film/41519/',
        });
        document.querySelector('h1')!.textContent = 'Брат (1997)';
      }, 300);
    });

    await expect
      .poll(() => sentSearches(page))
      .toEqual([
        { query: 'The Matrix', mediaType: 'movie', year: 1999 },
        { query: 'Брат', mediaType: 'movie', year: 1997 },
      ]);
    await expect(page.locator(CARD)).toHaveCount(1);
  });
});
