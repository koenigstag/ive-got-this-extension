import { test, expect, type Page } from '@playwright/test';
import { setupContentScript, mockResponses } from './e2e-helpers';

const CARD = '#media-connector-ivi-card';

const sentSearches = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __sentMessages: { type: string; payload?: unknown }[] }).__sentMessages
      .filter((m) => m.type === 'SEARCH_JELLYSEERR')
      .map((m) => m.payload),
  );

test.describe('ivi — content script injection', () => {
  test('injects card for a movie', async ({ page }) => {
    await setupContentScript(page, 'ivi-movie.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrMovie('Глухарь в кино'),
    });

    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    await expect(card).toContainText("I've got this!");
    await expect(card).toContainText('Глухарь в кино');
    expect(await sentSearches(page)).toEqual([
      { query: 'Глухарь в кино', mediaType: 'movie', year: 2010 },
    ]);
  });

  test('injects card for a series', async ({ page }) => {
    await setupContentScript(page, 'ivi-series.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrSeries('Химера', 'not_requested'),
    });

    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    await expect(card).toContainText('Химера');
    await expect(card.locator('button')).not.toHaveCount(0);
    expect(await sentSearches(page)).toEqual([{ query: 'Химера', mediaType: 'tv', year: 2022 }]);
  });

  test('card sits between the hero and the rest of the page', async ({ page }) => {
    await setupContentScript(page, 'ivi-series.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrSeries('Химера'),
    });

    const cardBox = await page.locator(CARD).boundingBox();
    const heroBox = await page.locator('.oversideTrailer').boundingBox();
    const undersideBox = await page.locator('.underside').boundingBox();
    expect(cardBox!.y).toBeGreaterThanOrEqual(heroBox!.y + heroBox!.height);
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(undersideBox!.y);
  });

  test('shows "No results" for empty response', async ({ page }) => {
    await setupContentScript(page, 'ivi-movie.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrEmpty,
    });

    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    await expect(card).toContainText('No results');
  });

  test('without Jellyseerr results: the title on the server and a Prowlarr search', async ({
    page,
  }) => {
    await setupContentScript(page, 'ivi-series.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: {
        type: 'SEARCH_JELLYSEERR_RESPONSE',
        payload: {
          results: [],
          jellyseerrEnabled: true,
          serverType: 'jellyfin',
          serverMatch: { status: 'available', itemUrl: 'http://jellyfin.home/web/#/details?id=1' },
          prowlarrUrl: 'http://prowlarr.lab.home',
        },
      },
    });

    const card = page.locator(CARD);
    await expect(card).toContainText('Available on Jellyfin');
    await expect(card).toContainText('Found by the title "Химера"');
    await expect(card.locator('[data-action="play-on-server"]')).toBeVisible();

    await card.locator('[data-action="find-release"]').click();
    const openTabs = await page.evaluate(() =>
      (
        window as unknown as { __sentMessages: { type: string; payload?: unknown }[] }
      ).__sentMessages
        .filter((m) => m.type === 'OPEN_TAB')
        .map((m) => m.payload),
    );
    expect(openTabs).toEqual([
      {
        url: 'http://prowlarr.lab.home/search?query=%D0%A5%D0%B8%D0%BC%D0%B5%D1%80%D0%B0&categories=5000',
      },
    ]);
  });

  test('follows in-app navigation to another title', async ({ page }) => {
    await setupContentScript(page, 'ivi-series.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrSeries('Химера'),
    });
    await expect(page.locator(CARD)).toBeVisible();

    // ivi changes the URL first and the page a moment later.
    await page.evaluate(() => {
      history.pushState({}, '', '/watch/109140');
      setTimeout(() => {
        document
          .querySelector('meta[property="og:title"]')!
          .setAttribute('content', 'Глухарь в кино — на Иви!');
        document.querySelector('h1')!.textContent = 'Фильм Глухарь в кино смотреть онлайн';
        document.querySelector('[data-test="serieBadge"]')!.remove();
        const params = document.querySelector('[data-test="meta_params"] ul')!;
        params.innerHTML = '<a href="/movies/2010">2010</a><div>1 ч. 30 мин.</div>';
      }, 300);
    });

    await expect
      .poll(() => sentSearches(page))
      .toEqual([
        { query: 'Химера', mediaType: 'tv', year: 2022 },
        { query: 'Глухарь в кино', mediaType: 'movie', year: 2010 },
      ]);
    await expect(page.locator(CARD)).toHaveCount(1);
  });
});
