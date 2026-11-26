import { describe, it, expect, beforeEach } from 'vitest';
import { getTvdbPageType, readTvdbTitle } from './tvdb-page.js';

describe('getTvdbPageType', () => {
  it.each([
    ['https://www.thetvdb.com/series/kusuriya-no-hitorigoto', 'tv'],
    ['https://www.thetvdb.com/series/kusuriya-no-hitorigoto/', 'tv'],
    ['https://www.thetvdb.com/movies/your-name', 'movie'],
  ])('reads %s', (url, expected) => {
    expect(getTvdbPageType(url)).toBe(expected);
  });

  it.each([
    'https://www.thetvdb.com/',
    'https://www.thetvdb.com/series/kusuriya-no-hitorigoto/seasons/official/1',
    'https://www.thetvdb.com/series/kusuriya-no-hitorigoto/episodes/10025613',
    'https://www.thetvdb.com/people/7967232-norihiro-naganuma',
  ])('ignores %s', (url) => {
    expect(getTvdbPageType(url)).toBeUndefined();
  });
});

/** The parts of a TVDB page the reader looks at, as the site renders them. */
const renderPage = (basicInfo: string): void => {
  document.body.innerHTML = `
    <div class="container">
      <div class="row mt-2">
        <div class="col-xs-12 col-sm-8"><h1 class="translated_title mt-0" id="series_title">The Apothecary Diaries</h1></div>
      </div>
      <div><div id="general" class="tab-pane active"><div id="series_basic_info" class="block">
        <ul class="list-group">${basicInfo}</ul>
      </div></div></div>
    </div>`;
};

describe('readTvdbTitle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('reads a series: TMDB id, name and first-aired year', () => {
    renderPage(`
      <li class="list-group-item clearfix"><strong>TheTVDB.com Series ID</strong><span>431162</span></li>
      <li class="list-group-item clearfix"><strong>First Aired</strong><span>October 22, 2023</span></li>
      <li class="list-group-item clearfix"><strong>Other Sites</strong><span>
        <a href="https://www.imdb.com/title/tt26743760/">IMDB</a>
        <a href="https://www.themoviedb.org/tv/220542">TheMovieDB.com</a>
      </span></li>`);

    expect(
      readTvdbTitle(document, 'https://www.thetvdb.com/series/kusuriya-no-hitorigoto'),
    ).toEqual({ mediaType: 'tv', tmdbId: 220542, title: 'The Apothecary Diaries', year: 2023 });
  });

  it('reads a movie from its first release line, and only takes a movie link', () => {
    renderPage(`
      <li class="list-group-item clearfix"><strong>Released</strong><span>Worldwide July 3, 2016</span></li>
      <li class="list-group-item clearfix"><strong>Released</strong><span>Japan August 26, 2016</span></li>
      <li class="list-group-item clearfix"><span>
        <a href="https://www.themoviedb.org/tv/999">wrong type</a>
        <a href="https://www.themoviedb.org/movie/372058">TheMovieDB.com</a>
      </span></li>`);

    expect(readTvdbTitle(document, 'https://www.thetvdb.com/movies/your-name')).toMatchObject({
      mediaType: 'movie',
      tmdbId: 372058,
      year: 2016,
    });
  });

  it('has no TMDB id without the link', () => {
    renderPage(
      '<li class="list-group-item clearfix"><strong>First Aired</strong><span>2024</span></li>',
    );

    expect(readTvdbTitle(document, 'https://www.thetvdb.com/series/some-local-show')).toEqual({
      mediaType: 'tv',
      tmdbId: undefined,
      title: 'The Apothecary Diaries',
      year: 2024,
    });
  });
});
