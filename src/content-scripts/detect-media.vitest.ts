import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Option } from 'effect';
import { identifySite, detectMedia, detectMediaOption, cleanIviTitle } from './detect-media.js';

const E2E_FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../../e2e/fixtures');

describe('identifySite', () => {
  it('identifies IMDb', () => {
    expect(identifySite('https://www.imdb.com/title/tt0133093/')).toBe('imdb');
    expect(identifySite('https://m.imdb.com/title/tt0133093/')).toBe('imdb');
  });

  it('identifies Trakt', () => {
    expect(identifySite('https://trakt.tv/movies/the-matrix-1999')).toBe('trakt');
    expect(identifySite('https://trakt.tv/shows/breaking-bad')).toBe('trakt');
  });

  it('identifies Netflix', () => {
    expect(identifySite('https://www.netflix.com/title/80100172')).toBe('netflix');
    expect(identifySite('https://www.netflix.com/de-en/title/80057281')).toBe('netflix');
  });

  it('identifies Amazon', () => {
    expect(identifySite('https://www.amazon.com/gp/video/detail/B00BI1KNY6')).toBe('amazon');
    expect(identifySite('https://www.primevideo.com/detail/0RCNZ4K3V8DHSCOKN44')).toBe('amazon');
  });

  it('identifies Google', () => {
    expect(identifySite('https://www.google.com/search?q=the+matrix')).toBe('google');
  });

  it('identifies Bing', () => {
    expect(identifySite('https://www.bing.com/search?q=the+matrix')).toBe('bing');
  });

  it('identifies JustWatch', () => {
    expect(identifySite('https://www.justwatch.com/us/movie/the-matrix')).toBe('justwatch');
  });

  it('identifies ivi on ivi.ru and on ivi.tv', () => {
    expect(identifySite('https://www.ivi.ru/watch/himera')).toBe('ivi');
    expect(identifySite('https://ivi.ru/watch/himera')).toBe('ivi');
    expect(identifySite('https://www.ivi.tv/watch/himera')).toBe('ivi');
    expect(identifySite('https://www.kiwi.ru/watch/himera')).toBe('unknown');
  });

  it('returns unknown for unsupported sites', () => {
    expect(identifySite('https://www.example.com')).toBe('unknown');
    expect(identifySite('https://www.reddit.com/r/movies')).toBe('unknown');
  });
});

describe('detectMedia', () => {
  // These tests exercise the DOM-dependent detectors.
  // In happy-dom we can set window.location and create DOM elements.

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  describe('IMDb detection', () => {
    it('detects a movie from IMDb title page', () => {
      // Set location to an IMDb movie page
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.imdb.com/title/tt0133093/'),
        writable: true,
        configurable: true,
      });

      // Mock the page structure
      document.body.innerHTML = `
        <div data-testid="hero__pageTitle"><span>The Matrix</span></div>
        <div data-testid="hero-title-block__metadata">
          <li>1999</li>
          <span>1h 56m</span>
        </div>
      `;

      const result = detectMedia();
      expect(result).toBeDefined();
      expect(result!.type).toBe('movie');
      if (result!.type === 'movie') {
        expect(result!.title).toBe('The Matrix');
        expect(result!.year).toBe(1999);
        expect(result!.imdbId).toBe('tt0133093');
      }
    });

    it('detects a TV series from IMDb', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.imdb.com/title/tt0903747/'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <div data-testid="hero__pageTitle"><span>Breaking Bad</span></div>
        <div data-testid="hero-title-block__metadata">
          <li>TV Series</li>
          <span>2008–2013</span>
        </div>
      `;

      const result = detectMedia();
      expect(result).toBeDefined();
      expect(result!.type).toBe('series');
      if (result!.type === 'series') {
        expect(result!.title).toBe('Breaking Bad');
        expect(result!.imdbId).toBe('tt0903747');
      }
    });

    it('detects a season from IMDb episodes page', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.imdb.com/title/tt0903747/episodes?season=3'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <div data-testid="hero__pageTitle"><span>Breaking Bad</span></div>
      `;

      const result = detectMedia();
      expect(result).toBeDefined();
      expect(result!.type).toBe('season');
      if (result!.type === 'season') {
        expect(result!.seriesTitle).toBe('Breaking Bad');
        expect(result!.seasonNumber).toBe(3);
      }
    });

    it('detects an episode from IMDb', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.imdb.com/title/tt2301451/'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <div data-testid="hero__pageTitle"><span>Ozymandias</span></div>
        <div data-testid="hero-subnav-bar-season-episode-numbers-section">S5.E14</div>
        <a data-testid="hero-title-block__series-link">Breaking Bad</a>
      `;

      const result = detectMedia();
      expect(result).toBeDefined();
      expect(result!.type).toBe('episode');
      if (result!.type === 'episode') {
        expect(result!.seriesTitle).toBe('Breaking Bad');
        expect(result!.seasonNumber).toBe(5);
        expect(result!.episodeNumber).toBe(14);
      }
    });

    it('returns undefined when no title element exists', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.imdb.com/title/tt0000000/'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `<div></div>`;

      const result = detectMedia();
      expect(result).toBeUndefined();
    });
  });

  describe('Google detection', () => {
    it('detects a movie from Google knowledge panel', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.google.com/search?q=the+matrix+1999'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <div data-attrid="title">The Matrix</div>
        <div data-attrid="subtitle">1999 ‧ Action/Sci-fi ‧ 2h 16m</div>
        <div data-attrid="kc:/film/film:cast"></div>
      `;

      const result = detectMedia();
      expect(result).toBeDefined();
      expect(result!.type).toBe('movie');
      if (result!.type === 'movie') {
        expect(result!.title).toBe('The Matrix');
        expect(result!.year).toBe(1999);
      }
    });

    it('detects a TV series from Google', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.google.com/search?q=breaking+bad+tv+series'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <div data-attrid="title">Breaking Bad</div>
        <div data-attrid="subtitle">TV Series ‧ 2008–2013</div>
      `;

      const result = detectMedia();
      expect(result).toBeDefined();
      expect(result!.type).toBe('series');
    });

    it('returns undefined when no knowledge panel exists', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.google.com/search?q=random+query'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `<div class="search-results"></div>`;

      const result = detectMedia();
      expect(result).toBeUndefined();
    });
  });

  describe('Bing detection', () => {
    it('detects a movie from Bing', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.bing.com/search?q=the+matrix'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <h2 class="wpt_title">The Matrix</h2>
        <span class="wpt_subtitle">1999 Film</span>
      `;

      const result = detectMedia();
      expect(result).toBeDefined();
      expect(result!.type).toBe('movie');
      if (result!.type === 'movie') {
        expect(result!.title).toBe('The Matrix');
        expect(result!.year).toBe(1999);
      }
    });

    it('detects a series from Bing', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.bing.com/search?q=Breaking+Bad'),
        writable: true,
        configurable: true,
      });
      document.body.innerHTML = `
        <h2 class="wpt_title">Breaking Bad</h2>
        <span class="wpt_subtitle">2008 TV series</span>
      `;
      const result = detectMedia();
      expect(result?.type).toBe('series');
      expect(result?.title).toBe('Breaking Bad');
      expect(result?.year).toBe(2008);
    });

    it('returns undefined when no knowledge panel', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.bing.com/search?q=random'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `<div></div>`;

      const result = detectMedia();
      expect(result).toBeUndefined();
    });
  });

  describe('Google detection edge cases', () => {
    it('detects series from maindata TV_SERIES', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.google.com/search?q=Test'),
        writable: true,
        configurable: true,
      });
      document.body.innerHTML = `
        <div data-attrid="title">Test Show</div>
        <div data-maindata='["TV_SERIES"]'></div>
      `;
      const result = detectMedia();
      expect(result?.type).toBe('series');
    });

    it('detects movie from maindata FILM', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.google.com/search?q=Test'),
        writable: true,
        configurable: true,
      });
      document.body.innerHTML = `
        <div data-attrid="title">Test Movie</div>
        <div data-maindata='["FILM"]'></div>
      `;
      const result = detectMedia();
      expect(result?.type).toBe('movie');
    });
  });

  describe('JustWatch cleaning and detection', () => {
    it('cleans various JustWatch title patterns', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.justwatch.com/us/movie/test'),
        writable: true,
        configurable: true,
      });
      const meta = document.createElement('meta');
      meta.setAttribute('property', 'og:title');

      const patterns = [
        { raw: 'Title - watch tv show streaming online', expected: 'Title' },
        { raw: 'Title streaming: watch online', expected: 'Title' },
        { raw: 'Title | JustWatch', expected: 'Title' },
      ];

      for (const p of patterns) {
        meta.setAttribute('content', p.raw);
        document.head.appendChild(meta);
        const result = detectMedia();
        expect(result?.title).toBe(p.expected);
        document.head.removeChild(meta);
      }
    });

    it('detects season from JustWatch URL', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.justwatch.com/us/tv-show/test/season-1'),
        writable: true,
        configurable: true,
      });
      document.body.innerHTML = `<h1>Test Show</h1>`;
      const result = detectMedia();
      expect(result?.type).toBe('season');
      if (result?.type === 'season') {
        expect(result?.seasonNumber).toBe(1);
      }
    });
  });

  describe('JustWatch detection', () => {
    it('detects a movie from JustWatch', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.justwatch.com/us/movie/the-matrix'),
        writable: true,
        configurable: true,
      });

      const meta = document.createElement('meta');
      meta.setAttribute('property', 'og:title');
      meta.setAttribute('content', 'The Matrix - watch movie streaming online');
      document.head.appendChild(meta);

      document.body.innerHTML = `
        <script>{"originalReleaseYear":1999}</script>
      `;

      const result = detectMedia();
      expect(result).toBeDefined();
      expect(result!.type).toBe('movie');
      if (result!.type === 'movie') {
        expect(result!.title).toBe('The Matrix');
        expect(result!.year).toBe(1999);
      }
    });

    it('detects a TV show from JustWatch', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.justwatch.com/us/tv-show/breaking-bad'),
        writable: true,
        configurable: true,
      });

      const meta = document.createElement('meta');
      meta.setAttribute('property', 'og:title');
      meta.setAttribute('content', 'Breaking Bad - watch tv show streaming online');
      document.head.appendChild(meta);

      const result = detectMedia();
      expect(result).toBeDefined();
      expect(result!.type).toBe('series');
    });

    it('detects a season from JustWatch', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.justwatch.com/us/tv-show/breaking-bad/season-3'),
        writable: true,
        configurable: true,
      });

      const meta = document.createElement('meta');
      meta.setAttribute('property', 'og:title');
      meta.setAttribute('content', 'Breaking Bad - watch tv show streaming online');
      document.head.appendChild(meta);

      const result = detectMedia();
      expect(result).toBeDefined();
      expect(result!.type).toBe('season');
      if (result!.type === 'season') {
        expect(result!.seasonNumber).toBe(3);
      }
    });

    it('returns undefined for non-media JustWatch pages', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.justwatch.com/us/search'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `<div></div>`;

      const result = detectMedia();
      expect(result).toBeUndefined();
    });

    it('detects movie from JustWatch with fallback title', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.justwatch.com/us/movie/test'),
        writable: true,
        configurable: true,
      });
      // No og:title, no script
      document.head.innerHTML = '';
      document.body.innerHTML = '<h1>Fallback Title</h1>';

      const result = detectMedia();
      expect(result?.type).toBe('movie');
      expect(result?.title).toBe('Fallback Title');
    });
  });

  describe('ivi detection', () => {
    const setIviPage = (url: string, ogTitle: string | undefined, body: string): void => {
      Object.defineProperty(window, 'location', {
        value: new URL(url),
        writable: true,
        configurable: true,
      });
      if (ogTitle) {
        const meta = document.createElement('meta');
        meta.setAttribute('property', 'og:title');
        meta.setAttribute('content', ogTitle);
        document.head.appendChild(meta);
      }
      document.body.innerHTML = body;
    };

    const movieParams = `
      <div class="params meta__params" data-test="meta_params">
        <ul class="paramsList__container">
          <div class="ratingParams">7,9</div>
          <a href="/movies/2010">2010</a>
          <div data-test="content-duration">1 ч. 30 мин.</div>
          <div class="restrict"><div>16+</div></div>
        </ul>
      </div>`;

    const seriesParams = (years: string) => `
      <div class="serieBadge meta__serieBadge" data-test="serieBadge"><button>Серия 1 сезон 1</button></div>
      <div class="params meta__params" data-test="meta_params">
        <ul class="paramsList__container">
          <div class="ratingParams">8,6</div>
          <a href="/series/2022">${years}</a>
          <div class="nbl-link_noLink">2 сезона</div>
          <div class="restrict"><div>18+</div></div>
        </ul>
      </div>`;

    it('cleans og:title, heading and episode titles', () => {
      const cases = [
        { raw: 'Химера — на Иви!', expected: 'Химера' },
        { raw: 'Химера 1 сезон 3 серия', expected: 'Химера' },
        { raw: 'Сериал Химера смотреть онлайн', expected: 'Химера' },
        { raw: 'Фильм Глухарь в кино смотреть онлайн', expected: 'Глухарь в кино' },
        { raw: 'Возмездие (2019) — на Иви!', expected: 'Возмездие (2019)' },
        {
          raw: 'Человек-паук: Через вселенные — на Иви!',
          expected: 'Человек-паук: Через вселенные',
        },
        { raw: 'Chimera — on ivi', expected: 'Chimera' },
      ];
      for (const { raw, expected } of cases) {
        expect(cleanIviTitle(raw)).toBe(expected);
      }
    });

    it('detects a movie with its year', () => {
      setIviPage(
        'https://www.ivi.ru/watch/109140',
        'Глухарь в кино — на Иви!',
        `<h1>Фильм Глухарь в кино смотреть онлайн</h1>${movieParams}`,
      );

      expect(detectMedia()).toEqual({ type: 'movie', title: 'Глухарь в кино', year: 2010 });
    });

    it('detects a series from the season count and takes the first year of a range', () => {
      setIviPage(
        'https://www.ivi.ru/watch/himera',
        'Химера — на Иви!',
        `<h1>Сериал Химера смотреть онлайн</h1>${seriesParams('2022-2023')}`,
      );

      expect(detectMedia()).toEqual({ type: 'series', title: 'Химера', year: 2022 });
    });

    it('detects the show on an episode page', () => {
      setIviPage(
        'https://www.ivi.ru/watch/himera/495880',
        'Химера 1 сезон 3 серия',
        `<h1>Химера 1 сезон 3 серия смотреть онлайн</h1>
         <div data-test="meta_params"><a href="/series/2022">2022</a></div>`,
      );

      expect(detectMedia()).toEqual({ type: 'series', title: 'Химера', year: 2022 });
    });

    it('splits the year off a disambiguated title', () => {
      setIviPage('https://www.ivi.ru/watch/vozmezdiye-2019', 'Возмездие (2019) — на Иви!', '');

      expect(detectMedia()).toEqual({ type: 'movie', title: 'Возмездие', year: 2019 });
    });

    it('falls back to the h1 when there is no og:title', () => {
      setIviPage(
        'https://www.ivi.tv/watch/metal-family',
        undefined,
        `<h1>Мультфильм Metal Family смотреть онлайн</h1>${seriesParams('2018')}`,
      );

      expect(detectMedia()).toEqual({ type: 'series', title: 'Metal Family', year: 2018 });
    });

    it('returns undefined off title pages and without a title', () => {
      setIviPage('https://www.ivi.ru/series/2022', 'Сериалы — на Иви!', '<h1>Сериалы</h1>');
      expect(detectMedia()).toBeUndefined();

      document.head.innerHTML = '';
      setIviPage('https://www.ivi.ru/watch/himera', undefined, '<div></div>');
      expect(detectMedia()).toBeUndefined();
    });
  });

  describe('Trakt detection', () => {
    it('detects a movie from Trakt', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://trakt.tv/movies/the-matrix-1999'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <h1>The Matrix</h1>
        <span class="year">1999</span>
        <a href="https://www.imdb.com/title/tt0133093">IMDb</a>
        <a href="https://www.themoviedb.org/movie/603">TMDb</a>
      `;

      const result = detectMedia();
      expect(result).toBeDefined();
      expect(result!.type).toBe('movie');
      if (result!.type === 'movie') {
        expect(result!.title).toBe('The Matrix');
        expect(result!.year).toBe(1999);
        expect(result!.imdbId).toBe('tt0133093');
        expect(result!.tmdbId).toBe('603');
      }
    });

    it('detects a series from Trakt', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://trakt.tv/shows/breaking-bad'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <h1>Breaking Bad</h1>
        <span class="year">2008</span>
      `;

      const result = detectMedia();
      expect(result).toBeDefined();
      expect(result!.type).toBe('series');
    });

    it('detects a season from Trakt', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://trakt.tv/shows/breaking-bad/seasons/3'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <h1>Breaking Bad</h1>
        <span class="year">2008</span>
      `;

      const result = detectMedia();
      expect(result).toBeDefined();
      expect(result!.type).toBe('season');
      if (result!.type === 'season') {
        expect(result!.seasonNumber).toBe(3);
      }
    });

    it('detects an episode from Trakt', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://trakt.tv/shows/breaking-bad/seasons/5/episodes/14'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <h1>Breaking Bad</h1>
        <span class="year">2008</span>
      `;

      const result = detectMedia();
      expect(result).toBeDefined();
      expect(result!.type).toBe('episode');
      if (result!.type === 'episode') {
        expect(result!.seasonNumber).toBe(5);
        expect(result!.episodeNumber).toBe(14);
      }
    });

    it('reads the year from the summary subtitle on app.trakt.tv', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://app.trakt.tv/shows/the-mentalist?season=1'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <div class="trakt-summary-title">
          <h1 class="trakt-responsive-title">The Mentalist</h1>
        </div>
        <div class="trakt-summary-subtitle">
          <p class="secondary">2008 • 151 eps • TV-14 • Drama</p>
        </div>
      `;

      const result = detectMedia();
      expect(result).toBeDefined();
      expect(result!.type).toBe('series');
      if (result!.type === 'series') {
        expect(result!.title).toBe('The Mentalist');
        expect(result!.year).toBe(2008);
      }
    });

    it('ignores Trakt pages that are not a movie or show', () => {
      for (const url of ['https://app.trakt.tv/', 'https://app.trakt.tv/users/someone/lists']) {
        Object.defineProperty(window, 'location', {
          value: new URL(url),
          writable: true,
          configurable: true,
        });
        document.body.innerHTML = '<h1>Welcome back</h1>';

        expect(detectMedia()).toBeUndefined();
      }
    });
  });

  describe('Netflix detection', () => {
    it('detects a series from Netflix', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.netflix.com/title/80100172'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <h1>Stranger Things</h1>
        <div data-uia="episode-item">Episode 1</div>
      `;

      const result = detectMedia();
      expect(result).toBeDefined();
      expect(result!.type).toBe('series');
      if (result!.type === 'series') {
        expect(result!.title).toBe('Stranger Things');
      }
    });

    it('detects a movie from Netflix (no episodes)', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.netflix.com/title/80100173'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <h1>Glass Onion</h1>
      `;

      const result = detectMedia();
      expect(result).toBeDefined();
      expect(result!.type).toBe('movie');
    });

    /** Load an e2e fixture (a trimmed copy of a live page) at the given URL. */
    const loadNetflixFixture = (file: string, url: string) => {
      Object.defineProperty(window, 'location', {
        value: new URL(url),
        writable: true,
        configurable: true,
      });
      const html = readFileSync(resolve(E2E_FIXTURES, file), 'utf-8');
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      document.head.innerHTML = parsed.head.innerHTML;
      document.body.innerHTML = parsed.body.innerHTML;
    };

    it('detects a series on the public title page, without the latest season year', () => {
      loadNetflixFixture(
        'netflix-public-series.html',
        'https://www.netflix.com/de-en/title/80057281',
      );

      expect(detectMedia()).toEqual({ type: 'series', title: 'Stranger Things' });
    });

    it('detects a movie and its release year on the public title page', () => {
      loadNetflixFixture('netflix-public-movie.html', 'https://www.netflix.com/de/title/81458416');

      expect(detectMedia()).toEqual({
        type: 'movie',
        title: 'Glass Onion: A Knives Out Mystery',
        year: 2022,
      });
    });

    it('takes the type from JSON-LD, whatever the UI language', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.netflix.com/de/title/80192098'),
        writable: true,
        configurable: true,
      });
      document.head.innerHTML = `
        <script type="application/ld+json">
          {"@type":"TVSeries","name":"Haus des Geldes","numberOfSeasons":5}
        </script>
      `;
      document.body.innerHTML = `
        <h1>Haus des Geldes</h1>
        <div data-uia="metadata"><ul><li>2021</li><li>5 Teile</li><li>16</li></ul></div>
      `;

      expect(detectMedia()).toEqual({ type: 'series', title: 'Haus des Geldes' });
    });

    it('detects a series from the episodes section when there is no JSON-LD', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.netflix.com/ua/title/80057281'),
        writable: true,
        configurable: true,
      });
      document.body.innerHTML = `
        <h1>Stranger Things</h1>
        <div data-uia="episodes"><div data-uia="season-selector"></div></div>
      `;

      expect(detectMedia()).toEqual({ type: 'series', title: 'Stranger Things' });
    });

    it('detects nothing on a title page that is not available in the country', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.netflix.com/de-en/title/70079583'),
        writable: true,
        configurable: true,
      });
      document.head.innerHTML = `
        <script type="application/ld+json">{"@type":"Movie","name":" "}</script>
        <script type="application/ld+json">not json</script>
      `;
      document.body.innerHTML = `
        <h1></h1>
        <div data-uia="metadata"><ul><li>Action</li></ul></div>
      `;

      expect(detectMedia()).toBeUndefined();
    });
  });

  describe('Amazon detection', () => {
    it('detects a movie from Amazon', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.amazon.com/gp/video/detail/B00BI1KNY6'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <h1 data-automation-id="title">The Tomorrow War</h1>
        <div data-automation-id="release-year-badge">2021</div>
      `;

      const result = detectMedia();
      expect(result).toBeDefined();
      expect(result!.type).toBe('movie');
      if (result!.type === 'movie') {
        expect(result!.title).toBe('The Tomorrow War');
        expect(result!.year).toBe(2021);
      }
    });

    it('detects a series from Amazon', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.amazon.com/gp/video/detail/B07VP9V7X9'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <h1 data-automation-id="title">The Boys</h1>
        <div data-automation-id="season-selector">Season 1</div>
      `;

      const result = detectMedia();
      expect(result).toBeDefined();
      expect(result!.type).toBe('series');
    });
  });

  describe('unknown site', () => {
    it('returns undefined for unsupported sites', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.example.com'),
        writable: true,
        configurable: true,
      });

      const result = detectMedia();
      expect(result).toBeUndefined();
    });
  });

  describe('detectMediaOption', () => {
    it('returns Option.none for unsupported sites', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.example.com'),
        writable: true,
        configurable: true,
      });

      const result = detectMediaOption();
      expect(Option.isNone(result)).toBe(true);
    });

    it('returns Option.some for IMDb movie page', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://www.imdb.com/title/tt0133093/'),
        writable: true,
        configurable: true,
      });

      document.body.innerHTML = `
        <div data-testid="hero__pageTitle"><span>The Matrix</span></div>
        <div data-testid="hero-title-block__metadata">
          <li>1999</li>
          <span>1h 56m</span>
        </div>
      `;

      const result = detectMediaOption();
      expect(Option.isSome(result)).toBe(true);
      if (Option.isSome(result)) {
        const media = result.value;
        if (media.type === 'movie') {
          expect(media.title).toBe('The Matrix');
        }
      }
    });
  });
});
