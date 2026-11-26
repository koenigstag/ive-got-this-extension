/**
 * Details for the media dialog: what the media server has of a title, and what
 * Jellyseerr knows of it and can still request. One message, so the dialog
 * opens with everything at once.
 */
import { Effect, Either } from 'effect';
import type {
  DetectedMedia,
  ExtensionConfig,
  MediaAvailability,
  MediaSearchResult,
  MediaServerItem,
} from '../types/index.js';
import type {
  GetMediaDetailsMessage,
  MediaDetailsJellyseerr,
  MediaDetailsResponse,
  MediaDetailsSeason,
  MediaDetailsServer,
  MediaRequestState,
} from '../types/messages.js';
import type {
  JellyseerrMediaDetails,
  JellyseerrSearchResponse,
  JellyseerrSearchResult,
} from '../utils/jellyseerr-client.js';
import { buildServerItemUrl, mapMediaStatus } from './service-worker-helpers.js';

/** The server and Jellyseerr calls the details need, injectable for tests. */
export interface MediaDetailsDeps {
  readonly checkAvailability: (
    config: ExtensionConfig,
    media: DetectedMedia,
  ) => Effect.Effect<MediaAvailability>;
  readonly getEpisodes: (
    config: ExtensionConfig,
    seriesId: string,
  ) => Effect.Effect<MediaSearchResult, unknown>;
  readonly searchJellyseerr: (
    config: ExtensionConfig,
    query: string,
  ) => Effect.Effect<JellyseerrSearchResponse, unknown>;
  readonly getJellyseerrDetails: (
    config: ExtensionConfig,
    mediaType: 'movie' | 'tv',
    tmdbId: number,
  ) => Effect.Effect<JellyseerrMediaDetails, unknown>;
}

type Payload = GetMediaDetailsMessage['payload'];

const errorMessage = (e: unknown): string => {
  if (e && typeof e === 'object') {
    if ('reason' in e) return String(e.reason);
    if ('message' in e) return String(e.message);
  }
  return String(e);
};

const yearOf = (date: string | undefined): number | undefined => {
  const year = date ? parseInt(date.slice(0, 4), 10) : NaN;
  return Number.isNaN(year) ? undefined : year;
};

const REQUEST_STATES: Readonly<Record<number, MediaRequestState>> = {
  1: 'pending',
  2: 'approved',
  3: 'declined',
  4: 'failed',
  5: 'completed',
};

/** Count a series' episodes on the server per season number (placeholders left out). */
export const countEpisodesBySeason = (
  episodes: readonly MediaServerItem[],
): ReadonlyMap<number, number> => {
  const counts = new Map<number, number>();
  for (const episode of episodes) {
    if (episode.ParentIndexNumber === undefined || episode.LocationType === 'Virtual') continue;
    counts.set(episode.ParentIndexNumber, (counts.get(episode.ParentIndexNumber) ?? 0) + 1);
  }
  return counts;
};

/** The TMDB ID a server item carries, if any. */
const tmdbIdOf = (item: MediaServerItem | undefined): number | undefined => {
  const entry = Object.entries(item?.ProviderIds ?? {}).find(
    ([key]) => key.toLowerCase() === 'tmdb',
  );
  const id = entry ? parseInt(String(entry[1]), 10) : NaN;
  return Number.isNaN(id) ? undefined : id;
};

/**
 * Pick the Jellyseerr search result for a title: the right media type, and the
 * given year when one matches.
 */
export const pickSearchResult = (
  results: readonly JellyseerrSearchResult[],
  mediaType: 'movie' | 'tv',
  year?: number,
): JellyseerrSearchResult | undefined => {
  const ofType = results.filter((r) => r.mediaType === mediaType);
  if (year) {
    const sameYear = ofType.find((r) => yearOf(r.releaseDate ?? r.firstAirDate) === year);
    if (sameYear) return sameYear;
  }
  return ofType[0];
};

/** A season's state in Jellyseerr, from its media info or, before that exists, its requests. */
const seasonStatus = (
  details: JellyseerrMediaDetails,
  seasonNumber: number,
): MediaDetailsSeason['status'] => {
  const info = details.mediaInfo;
  const season = info?.seasons?.find((s) => s.seasonNumber === seasonNumber);
  if (season) return mapMediaStatus(season.status);

  const request = info?.requests?.find(
    (r) =>
      (r.status === 1 || r.status === 2) && r.seasons?.some((s) => s.seasonNumber === seasonNumber),
  );
  if (request) return request.status === 1 ? 'pending' : 'processing';
  return 'not_requested';
};

const isRequestable = (status: MediaDetailsSeason['status']): boolean =>
  status === 'not_requested' || status === 'unknown';

/**
 * The seasons of a series from Jellyseerr's TMDB list and the server's episodes.
 * Specials (season 0) are left out, as Jellyseerr does by default.
 */
export const buildSeasons = (
  details: JellyseerrMediaDetails | undefined,
  serverEpisodes: ReadonlyMap<number, number> | undefined,
): MediaDetailsSeason[] => {
  const numbers = new Set<number>();
  for (const season of details?.seasons ?? []) numbers.add(season.seasonNumber);
  for (const seasonNumber of serverEpisodes?.keys() ?? []) numbers.add(seasonNumber);
  numbers.delete(0);

  return [...numbers]
    .sort((a, b) => a - b)
    .map((seasonNumber) => {
      const tmdbSeason = details?.seasons?.find((s) => s.seasonNumber === seasonNumber);
      const status = details ? seasonStatus(details, seasonNumber) : undefined;
      return {
        seasonNumber,
        episodeCount: tmdbSeason?.episodeCount,
        serverEpisodeCount: serverEpisodes ? (serverEpisodes.get(seasonNumber) ?? 0) : undefined,
        status,
        requestable: !!tmdbSeason && isRequestable(status),
      };
    });
};

/** What the dialog shows of a title found in Jellyseerr. */
export const buildJellyseerrFound = (
  config: ExtensionConfig,
  mediaType: 'movie' | 'tv',
  details: JellyseerrMediaDetails,
  seasons: readonly MediaDetailsSeason[],
): MediaDetailsJellyseerr => {
  const status = mapMediaStatus(details.mediaInfo?.status);
  const baseUrl = config.jellyseerr.serverUrl.replace(/\/+$/, '');
  return {
    state: 'found',
    tmdbId: details.id,
    title: details.title ?? details.name ?? '',
    year: yearOf(details.releaseDate ?? details.firstAirDate),
    status,
    url: `${baseUrl}/${mediaType}/${details.id}`,
    requestable: mediaType === 'movie' ? isRequestable(status) : seasons.some((s) => s.requestable),
    requests: (details.mediaInfo?.requests ?? []).flatMap((r) => {
      const state = REQUEST_STATES[r.status];
      return state
        ? [{ state, requestedBy: r.requestedBy?.displayName, createdAt: r.createdAt }]
        : [];
    }),
  };
};

const isJellyseerrReady = (config: ExtensionConfig): boolean =>
  config.jellyseerr.enabled && !!config.jellyseerr.serverUrl && !!config.jellyseerr.apiKey;

/**
 * Gather the media dialog's details. Never fails: a server or Jellyseerr that
 * does not answer shows up as that part's `error` state.
 */
export const getMediaDetailsEffect = (
  deps: MediaDetailsDeps,
  config: ExtensionConfig,
  payload: Payload,
): Effect.Effect<MediaDetailsResponse> =>
  Effect.gen(function* () {
    const { title, year, imdbId, tmdbId: payloadTmdbId, mediaType } = payload;
    const media: DetectedMedia =
      mediaType === 'movie'
        ? { type: 'movie', title, year, imdbId, tmdbId: payloadTmdbId }
        : { type: 'series', title, year, imdbId, tmdbId: payloadTmdbId };

    // 1. The media server
    const availability = yield* deps.checkAvailability(config, media);
    let server: MediaDetailsServer;
    let serverItem: MediaServerItem | undefined;
    if (availability.status === 'available' || availability.status === 'partial') {
      serverItem = availability.item;
      server = {
        state: 'found',
        name: serverItem.Name,
        year: serverItem.ProductionYear,
        itemUrl: buildServerItemUrl(
          config.server.serverType,
          availability.serverUrl,
          serverItem.Id,
          serverItem.ServerId,
        ),
      };
    } else if (availability.status === 'unconfigured') {
      server = { state: 'unconfigured' };
    } else if (availability.status === 'error') {
      server = { state: 'error', message: availability.message };
    } else {
      server = { state: 'missing' };
    }

    let serverEpisodes: ReadonlyMap<number, number> | undefined;
    if (mediaType === 'series' && serverItem?.Type === 'Series') {
      const episodes = yield* Effect.either(deps.getEpisodes(config, serverItem.Id));
      if (Either.isRight(episodes)) serverEpisodes = countEpisodesBySeason(episodes.right.Items);
    }

    // 2. Jellyseerr
    const seerrType = mediaType === 'movie' ? 'movie' : 'tv';
    let jellyseerr: MediaDetailsJellyseerr = { state: 'disabled' };
    let seerrDetails: JellyseerrMediaDetails | undefined;

    if (isJellyseerrReady(config)) {
      let tmdbId: number | undefined = payloadTmdbId ? parseInt(payloadTmdbId, 10) : undefined;
      if (!tmdbId || Number.isNaN(tmdbId)) tmdbId = tmdbIdOf(serverItem);

      let searchError: string | undefined;
      if (!tmdbId) {
        const search = yield* Effect.either(deps.searchJellyseerr(config, title));
        if (Either.isLeft(search)) searchError = errorMessage(search.left);
        else tmdbId = pickSearchResult(search.right.results, seerrType, year)?.id;
      }

      if (searchError) {
        jellyseerr = { state: 'error', message: searchError };
      } else if (!tmdbId) {
        jellyseerr = { state: 'not_found' };
      } else {
        const details = yield* Effect.either(deps.getJellyseerrDetails(config, seerrType, tmdbId));
        if (Either.isLeft(details)) {
          jellyseerr = { state: 'error', message: errorMessage(details.left) };
        } else {
          seerrDetails = details.right;
        }
      }
    }

    const seasons = mediaType === 'series' ? buildSeasons(seerrDetails, serverEpisodes) : [];
    if (seerrDetails) jellyseerr = buildJellyseerrFound(config, seerrType, seerrDetails, seasons);

    return {
      type: 'MEDIA_DETAILS_RESPONSE' as const,
      payload: {
        serverType: config.server.serverType,
        mediaType,
        server,
        jellyseerr,
        seasons,
      },
    };
  });
