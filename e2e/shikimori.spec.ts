import { test, expect, type Page } from '@playwright/test';
import { setupContentScript, mockResponses } from './e2e-helpers';

const CARD = '#media-connector-shikimori-card';

const sentSearches = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __sentMessages: { type: string; payload?: unknown }[] }).__sentMessages
      .filter((m) => m.type === 'SEARCH_JELLYSEERR')
      .map((m) => m.payload),
  );

test.describe('Shikimori — content script injection', () => {
  test('injects card for a TV series, searched by the English title', async ({ page }) => {
    await setupContentScript(page, 'shikimori-tv.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrSeries('The Apothecary Diaries'),
    });

    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    await expect(card).toContainText("I've got this!");
    await expect(card).toContainText('The Apothecary Diaries');
    await expect(card.locator('button')).not.toHaveCount(0);
    expect(await sentSearches(page)).toEqual([
      { query: 'The Apothecary Diaries', mediaType: 'tv', year: 2023 },
    ]);
  });

  test('injects card for a movie', async ({ page }) => {
    await setupContentScript(page, 'shikimori-movie.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrMovie('Your Name.'),
    });

    await expect(page.locator(CARD)).toContainText('Your Name.');
    expect(await sentSearches(page)).toEqual([
      { query: 'Your Name.', mediaType: 'movie', year: 2016 },
    ]);
  });

  test('card sits under the information blocks, above the description', async ({ page }) => {
    await setupContentScript(page, 'shikimori-tv.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrSeries('The Apothecary Diaries'),
    });

    const card = page.locator(`.c-description > ${CARD}:first-child`);
    await expect(card).toBeVisible();
    const cardBox = await card.boundingBox();
    const aboutBox = await page.locator('.c-about').boundingBox();
    const headingBox = await page.locator('.c-description > .subheadline').boundingBox();
    expect(cardBox!.y).toBeGreaterThanOrEqual(aboutBox!.y + aboutBox!.height);
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(headingBox!.y);
  });

  test('tries every title, then shows "No results"', async ({ page }) => {
    await setupContentScript(page, 'shikimori-tv.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrEmpty,
    });

    const card = page.locator(CARD);
    await expect(card).toContainText('No results');
    await expect(card).toContainText('Монолог фармацевта');
    expect(await sentSearches(page)).toEqual([
      { query: 'The Apothecary Diaries', mediaType: 'tv', year: 2023 },
      { query: 'Kusuriya no Hitorigoto', mediaType: 'tv', year: 2023 },
      { query: 'Монолог фармацевта', mediaType: 'tv', year: 2023 },
    ]);
  });

  test('follows a Turbolinks visit to another anime', async ({ page }) => {
    await setupContentScript(page, 'shikimori-tv.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrSeries('The Apothecary Diaries'),
    });
    await expect(page.locator(CARD)).toBeVisible();

    // What Turbolinks does: snapshot event, new body, the new page's JSON-LD
    // added to <head> next to the old one, the URL, then the load event.
    await page.evaluate(() => {
      document.dispatchEvent(new Event('turbolinks:before-cache'));
      const ld = document.createElement('script');
      ld.type = 'application/ld+json';
      ld.textContent = JSON.stringify({
        '@type': 'Movie',
        url: 'https://shikimori.io/animes/32281-kimi-no-na-wa',
        name: 'Kimi no Na wa.',
        alternateName: ['Твоё имя', 'Your Name.'],
        datePublished: '2016-08-26',
      });
      document.head.appendChild(ld);
      document.querySelector('h1')!.innerHTML =
        'Твоё имя <span class="b-separator inline">/</span> Kimi no Na wa.';
      document.querySelector('.b-entry-info .value')!.textContent = 'Фильм';
      history.pushState({}, '', '/animes/32281-kimi-no-na-wa');
      document.dispatchEvent(new Event('turbolinks:load'));
    });

    await expect
      .poll(() => sentSearches(page))
      .toEqual([
        { query: 'The Apothecary Diaries', mediaType: 'tv', year: 2023 },
        { query: 'Your Name.', mediaType: 'movie', year: 2016 },
      ]);
    await expect(page.locator(CARD)).toHaveCount(1);
  });
});
