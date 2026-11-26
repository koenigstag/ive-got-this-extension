import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { setupContentScript, mockResponses } from './e2e-helpers';

/** The SEARCH_JELLYSEERR payload the content script sent. */
const sentSearch = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { __sentMessages: { type: string; payload?: unknown }[] }
      ).__sentMessages.find((m) => m.type === 'SEARCH_JELLYSEERR')?.payload,
  );

test.describe('Yandex Search — sidebar injection', () => {
  test('injects the sidebar for a film and searches its title, type and year', async ({ page }) => {
    await setupContentScript(page, 'yandex-movie.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrMovie('The Matrix'),
    });

    const sidebar = page.locator('#media-connector-sidebar');
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toContainText('The Matrix');
    expect(await sentSearch(page)).toEqual({ query: 'Матрица', mediaType: 'movie', year: 1999 });
  });

  test('puts the sidebar at the top of the right column, above the film card', async ({ page }) => {
    await setupContentScript(page, 'yandex-movie.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrMovie('The Matrix'),
    });

    const sidebar = page.locator('#search-result-aside > .serp-list > #media-connector-sidebar');
    await expect(sidebar).toBeVisible();

    const sidebarBox = await sidebar.boundingBox();
    const filmCardBox = await page.locator('.EntityCard_film').boundingBox();
    const resultsBox = await page.locator('#search-result').boundingBox();
    expect(sidebarBox!.y).toBeLessThan(filmCardBox!.y);
    expect(sidebarBox!.x).toBeGreaterThan(resultsBox!.x + resultsBox!.width);
  });

  test('injects the sidebar for a series from the right-column card on ya.ru', async ({ page }) => {
    await setupContentScript(page, 'yandex-series.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrSeries('Breaking Bad'),
    });

    const sidebar = page.locator('#media-connector-sidebar');
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toContainText('Breaking Bad');
    expect(await sentSearch(page)).toEqual({
      query: 'Во все тяжкие',
      mediaType: 'tv',
      year: 2008,
    });

    // The column has scrambled classes; the sidebar still sits right above the series card.
    const nextIsFilmCard = await sidebar.evaluate(
      (el) => !!el.nextElementSibling?.querySelector('.EntityCard_film'),
    );
    expect(nextIsFilmCard).toBe(true);
  });

  test('shows "No results" for an empty Jellyseerr response', async ({ page }) => {
    await setupContentScript(page, 'yandex-movie.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrEmpty,
    });

    const sidebar = page.locator('#media-connector-sidebar');
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toContainText('No results');
  });

  test('follows a new search that Yandex swaps in without loading a page', async ({ page }) => {
    await setupContentScript(page, 'yandex-movie.html', {
      GET_CONFIG: mockResponses.configEmby,
      SEARCH_JELLYSEERR: mockResponses.searchJellyseerrMovie('The Matrix'),
    });
    await expect(page.locator('#media-connector-sidebar')).toBeVisible();

    // What Yandex does on a search from its own box: new results in place, URL via pushState.
    const seriesBody = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'yandex-series.html'),
      'utf-8',
    ).match(/<body[^>]*>([\s\S]*)<\/body>/)![1];
    await page.evaluate((html) => {
      document.body.innerHTML = html;
      history.pushState(null, '', '/search/?text=breaking+bad');
    }, seriesBody);

    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as { __sentMessages: { type: string; payload?: { query: string } }[] }
          ).__sentMessages
            .filter((m) => m.type === 'SEARCH_JELLYSEERR')
            .map((m) => m.payload?.query),
        ),
      )
      .toEqual(['Матрица', 'Во все тяжкие']);
    await expect(page.locator('#media-connector-sidebar')).toHaveCount(1);
    await expect(page.locator('#media-connector-sidebar')).toBeVisible();
  });
});
