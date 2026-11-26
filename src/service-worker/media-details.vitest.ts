import { describe, it, expect, vi } from 'vitest';
import { Effect } from 'effect';
import {
  buildSeasons,
  countEpisodesBySeason,
  getMediaDetailsEffect,
  pickSearchResult,
  type MediaDetailsDeps,
} from './media-details.js';
import type { ExtensionConfig, MediaServerItem } from '../types/index.js';
import type { JellyseerrMediaDetails, JellyseerrSearchResult } from '../utils/jellyseerr-client.js';

const config: ExtensionConfig = {
  server: {
    serverType: 'jellyfin',
    serverUrl: 'http://jf.test',
    localServerUrl: '',
    apiKey: 'jf-key',
  },
  jellyseerr: {
    enabled: true,
    serverUrl: 'http://seerr.test/',
    localServerUrl: '',
    apiKey: 'seerr-key',
  },
};

const episode = (season: number, n: number): MediaServerItem => ({
  Id: `e${season}-${n}`,
  Name: `Episode ${n}`,
  Type: 'Episode',
  ParentIndexNumber: season,
  IndexNumber: n,
});

const mentalist: MediaServerItem = {
  Id: 'series-1',
  ServerId: 'srv',
  Name: 'The Mentalist',
  Type: 'Series',
  ProductionYear: 2008,
  ProviderIds: { Tmdb: '5920' },
};

const mentalistDetails: JellyseerrMediaDetails = {
  id: 5920,
  name: 'The Mentalist',
  firstAirDate: '2008-09-23',
  seasons: [
    { seasonNumber: 0, episodeCount: 2 },
    { seasonNumber: 1, episodeCount: 23 },
    { seasonNumber: 2, episodeCount: 23 },
    { seasonNumber: 3, episodeCount: 24 },
  ],
  mediaInfo: {
    status: 4,
    seasons: [{ seasonNumber: 1, status: 5 }],
    requests: [
      {
        id: 7,
        status: 1,
        createdAt: '2026-11-20T10:00:00.000Z',
        requestedBy: { displayName: 'alice' },
        seasons: [{ seasonNumber: 2, status: 2 }],
      },
    ],
  },
};

const fakeDeps = (overrides: Partial<MediaDetailsDeps> = {}): MediaDetailsDeps => ({
  checkAvailability: () =>
    Effect.succeed({ status: 'available', item: mentalist, serverUrl: 'http://jf.local' }),
  getEpisodes: () =>
    Effect.succeed({
      Items: [episode(1, 1), episode(1, 2), episode(2, 1)],
      TotalRecordCount: 3,
    }),
  searchJellyseerr: () => Effect.succeed({ page: 1, totalPages: 1, totalResults: 0, results: [] }),
  getJellyseerrDetails: () => Effect.succeed(mentalistDetails),
  ...overrides,
});

const payload = { title: 'Менталист', mediaType: 'series' as const };

describe('countEpisodesBySeason', () => {
  it('counts episodes per season number, without placeholders', () => {
    const counts = countEpisodesBySeason([
      episode(1, 1),
      episode(1, 2),
      episode(3, 1),
      { ...episode(3, 2), LocationType: 'Virtual' },
    ]);
    expect([...counts]).toEqual([
      [1, 2],
      [3, 1],
    ]);
  });
});

describe('pickSearchResult', () => {
  const results: JellyseerrSearchResult[] = [
    { id: 1, mediaType: 'movie', title: 'Dune', releaseDate: '1984-12-14', overview: '' },
    { id: 2, mediaType: 'tv', name: 'Dune', firstAirDate: '2000-12-03', overview: '' },
    { id: 3, mediaType: 'movie', title: 'Dune', releaseDate: '2021-09-15', overview: '' },
  ];

  it('takes the result of the given type and year', () => {
    expect(pickSearchResult(results, 'movie', 2021)?.id).toBe(3);
  });

  it('falls back to the first result of the type', () => {
    expect(pickSearchResult(results, 'movie', 1999)?.id).toBe(1);
    expect(pickSearchResult(results, 'tv')?.id).toBe(2);
  });
});

describe('buildSeasons', () => {
  it('merges Jellyseerr seasons, their state and the episodes on the server', () => {
    const seasons = buildSeasons(mentalistDetails, new Map([[1, 23]]));
    expect(seasons).toEqual([
      {
        seasonNumber: 1,
        episodeCount: 23,
        serverEpisodeCount: 23,
        status: 'available',
        requestable: false,
      },
      // Requested, not yet in the media info: the request's state
      {
        seasonNumber: 2,
        episodeCount: 23,
        serverEpisodeCount: 0,
        status: 'pending',
        requestable: false,
      },
      {
        seasonNumber: 3,
        episodeCount: 24,
        serverEpisodeCount: 0,
        status: 'not_requested',
        requestable: true,
      },
    ]);
  });

  it('lists the server seasons alone without Jellyseerr', () => {
    expect(buildSeasons(undefined, new Map([[2, 5]]))).toEqual([
      {
        seasonNumber: 2,
        episodeCount: undefined,
        serverEpisodeCount: 5,
        status: undefined,
        requestable: false,
      },
    ]);
  });
});

describe('getMediaDetailsEffect', () => {
  it('describes a series on the server and in Jellyseerr', async () => {
    const getJellyseerrDetails = vi.fn(() => Effect.succeed(mentalistDetails));
    const searchJellyseerr = vi.fn();
    const result = await Effect.runPromise(
      getMediaDetailsEffect(fakeDeps({ getJellyseerrDetails, searchJellyseerr }), config, payload),
    );

    // The TMDB ID comes from the server item, so there is no title search
    expect(searchJellyseerr).not.toHaveBeenCalled();
    expect(getJellyseerrDetails).toHaveBeenCalledWith(config, 'tv', 5920);

    expect(result.payload.server).toEqual({
      state: 'found',
      name: 'The Mentalist',
      year: 2008,
      itemUrl: expect.stringContaining('series-1'),
    });
    expect(result.payload.jellyseerr).toEqual({
      state: 'found',
      tmdbId: 5920,
      title: 'The Mentalist',
      year: 2008,
      status: 'partial',
      url: 'http://seerr.test/tv/5920',
      requestable: true,
      requests: [{ state: 'pending', requestedBy: 'alice', createdAt: '2026-11-20T10:00:00.000Z' }],
    });
    expect(result.payload.seasons.map((s) => [s.seasonNumber, s.serverEpisodeCount])).toEqual([
      [1, 2],
      [2, 1],
      [3, 0],
    ]);
  });

  it('finds a title missing from the server by searching Jellyseerr', async () => {
    const getJellyseerrDetails = vi.fn(() =>
      Effect.succeed({ id: 603, title: 'The Matrix', releaseDate: '1999-03-30' }),
    );
    const result = await Effect.runPromise(
      getMediaDetailsEffect(
        fakeDeps({
          checkAvailability: () => Effect.succeed({ status: 'unavailable' }),
          searchJellyseerr: () =>
            Effect.succeed({
              page: 1,
              totalPages: 1,
              totalResults: 1,
              results: [{ id: 603, mediaType: 'movie', title: 'The Matrix', overview: '' }],
            }),
          getJellyseerrDetails,
        }),
        config,
        { title: 'The Matrix', year: 1999, mediaType: 'movie' },
      ),
    );

    expect(getJellyseerrDetails).toHaveBeenCalledWith(config, 'movie', 603);
    expect(result.payload.server).toEqual({ state: 'missing' });
    expect(result.payload.jellyseerr).toMatchObject({
      state: 'found',
      status: 'not_requested',
      requestable: true,
      url: 'http://seerr.test/movie/603',
    });
    expect(result.payload.seasons).toEqual([]);
  });

  it('reports a Jellyseerr that does not answer, and keeps the server part', async () => {
    const result = await Effect.runPromise(
      getMediaDetailsEffect(
        fakeDeps({
          getJellyseerrDetails: () => Effect.fail({ reason: 'Fetch failed: http://seerr.test' }),
        }),
        config,
        payload,
      ),
    );

    expect(result.payload.jellyseerr).toEqual({
      state: 'error',
      message: 'Fetch failed: http://seerr.test',
    });
    expect(result.payload.server.state).toBe('found');
    // Seasons from the server only, none requestable
    expect(result.payload.seasons.every((s) => !s.requestable)).toBe(true);
  });

  it('leaves Jellyseerr out when it is not set up', async () => {
    const result = await Effect.runPromise(
      getMediaDetailsEffect(
        fakeDeps({ checkAvailability: () => Effect.succeed({ status: 'unconfigured' }) }),
        { ...config, jellyseerr: { ...config.jellyseerr, enabled: false } },
        payload,
      ),
    );

    expect(result.payload.server).toEqual({ state: 'unconfigured' });
    expect(result.payload.jellyseerr).toEqual({ state: 'disabled' });
    expect(result.payload.seasons).toEqual([]);
  });
});
