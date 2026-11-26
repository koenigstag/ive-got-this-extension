/**
 * Messages sent between content scripts, popup, and service worker.
 */
export type ExtensionMessage =
  | CheckMediaMessage
  | CheckMediaResponse
  | RequestMediaMessage
  | RequestMediaResponse
  | GetMediaDetailsMessage
  | MediaDetailsResponse
  | SearchJellyseerrMessage
  | SearchJellyseerrResponse
  | GetConfigMessage
  | GetConfigResponse
  | SaveConfigMessage
  | SaveConfigResponse
  | OpenTabMessage
  | OpenSettingsMessage;

/**
 * Request to open the extension's settings (its popup, or the same page in a tab).
 * Content scripts can't open the popup themselves.
 */
export interface OpenSettingsMessage {
  readonly type: 'OPEN_SETTINGS';
}

/**
 * Request to open a URL in a new tab via the service worker.
 * This bypasses SameSite cookie restrictions that prevent
 * cross-site link clicks from carrying session cookies.
 */
export interface OpenTabMessage {
  readonly type: 'OPEN_TAB';
  readonly payload: {
    readonly url: string;
  };
}

/**
 * Request to check if media exists on the server.
 */
export interface CheckMediaMessage {
  readonly type: 'CHECK_MEDIA';
  readonly payload: {
    readonly title: string;
    readonly year?: number;
    readonly imdbId?: string;
    readonly tmdbId?: string;
    readonly mediaType: 'movie' | 'series' | 'season' | 'episode';
    readonly seasonNumber?: number;
    readonly episodeNumber?: number;
  };
}

/**
 * Response with media availability status.
 */
export interface CheckMediaResponse {
  readonly type: 'CHECK_MEDIA_RESPONSE';
  readonly payload: {
    readonly status: 'available' | 'unavailable' | 'partial' | 'error' | 'unconfigured';
    readonly serverType?: 'emby' | 'jellyfin';
    readonly itemId?: string;
    readonly itemUrl?: string;
    readonly details?: string;
    readonly error?: string;
  };
}

/**
 * Request to submit a media request via Jellyseerr.
 */
export interface RequestMediaMessage {
  readonly type: 'REQUEST_MEDIA';
  readonly payload: {
    readonly title: string;
    readonly year?: number;
    readonly imdbId?: string;
    readonly tmdbId?: string;
    readonly mediaType: 'movie' | 'series';
    /** Seasons to request for a series; every season that is not there yet when absent. */
    readonly seasons?: readonly number[];
  };
}

/** Jellyseerr's state of a title or season. */
export type MediaStatusLabel =
  | 'available'
  | 'partial'
  | 'pending'
  | 'processing'
  | 'unknown'
  | 'not_requested';

/** State of a Jellyseerr request. */
export type MediaRequestState = 'pending' | 'approved' | 'declined' | 'failed' | 'completed';

/**
 * Request for everything the media dialog shows about a title: what the media
 * server has, and what Jellyseerr knows and can request.
 */
export interface GetMediaDetailsMessage {
  readonly type: 'GET_MEDIA_DETAILS';
  readonly payload: {
    readonly title: string;
    readonly year?: number;
    readonly imdbId?: string;
    readonly tmdbId?: string;
    readonly mediaType: 'movie' | 'series';
  };
}

/** The title on the media server. */
export type MediaDetailsServer =
  | { readonly state: 'unconfigured' }
  | { readonly state: 'missing' }
  | { readonly state: 'error'; readonly message: string }
  | {
      readonly state: 'found';
      readonly name: string;
      readonly year?: number;
      readonly itemUrl: string;
    };

/** The title in Jellyseerr. */
export type MediaDetailsJellyseerr =
  | { readonly state: 'disabled' }
  | { readonly state: 'not_found' }
  | { readonly state: 'error'; readonly message: string }
  | {
      readonly state: 'found';
      readonly tmdbId: number;
      readonly title: string;
      readonly year?: number;
      readonly status: MediaStatusLabel;
      /** The title's page in Jellyseerr. */
      readonly url: string;
      /** A movie that can be requested, or a series with a season that can. */
      readonly requestable: boolean;
      readonly requests: readonly {
        readonly state: MediaRequestState;
        readonly requestedBy?: string;
        readonly createdAt?: string;
      }[];
    };

/** One season of a series in the media dialog. */
export interface MediaDetailsSeason {
  readonly seasonNumber: number;
  /** Episodes in the season, as Jellyseerr (TMDB) lists them. */
  readonly episodeCount?: number;
  /** Episodes of the season on the media server. */
  readonly serverEpisodeCount?: number;
  /** Jellyseerr's state of the season; absent without Jellyseerr. */
  readonly status?: MediaStatusLabel;
  /** Whether Jellyseerr takes a request for the season. */
  readonly requestable: boolean;
}

/**
 * Response with the media dialog's details.
 */
export interface MediaDetailsResponse {
  readonly type: 'MEDIA_DETAILS_RESPONSE';
  readonly payload: {
    readonly serverType: 'emby' | 'jellyfin';
    readonly mediaType: 'movie' | 'series';
    readonly server: MediaDetailsServer;
    readonly jellyseerr: MediaDetailsJellyseerr;
    /** Seasons of a series (specials left out); empty for a movie. */
    readonly seasons: readonly MediaDetailsSeason[];
  };
}

/**
 * Response from a Jellyseerr media request.
 */
export interface RequestMediaResponse {
  readonly type: 'REQUEST_MEDIA_RESPONSE';
  readonly payload: {
    readonly success: boolean;
    readonly message: string;
  };
}

/**
 * Request to search Jellyseerr and return enriched results
 * including availability info from the connected media server.
 */
export interface SearchJellyseerrMessage {
  readonly type: 'SEARCH_JELLYSEERR';
  readonly payload: {
    readonly query: string;
    readonly mediaType?: 'movie' | 'tv';
    readonly year?: number;
    /**
     * The title's TMDB id, when the page names it. With `mediaType` it makes
     * the service worker take that title from Jellyseerr instead of searching.
     */
    readonly tmdbId?: number;
  };
}

/**
 * Jellyseerr search result item surfaced to the content script.
 */
export interface JellyseerrResultItem {
  readonly id: number;
  readonly title: string;
  readonly year?: number;
  readonly mediaType: 'movie' | 'tv';
  readonly overview: string;
  readonly posterUrl?: string;
  readonly status: 'available' | 'partial' | 'pending' | 'processing' | 'unknown' | 'not_requested';
  readonly serverUrl?: string;
  /** Direct link to the item on Emby/Jellyfin (only set when available/partial). */
  readonly serverItemUrl?: string;
}

/**
 * Response with Jellyseerr search results.
 */
export interface SearchJellyseerrResponse {
  readonly type: 'SEARCH_JELLYSEERR_RESPONSE';
  readonly payload: {
    readonly results: JellyseerrResultItem[];
    readonly jellyseerrEnabled: boolean;
    readonly serverType: 'emby' | 'jellyfin';
    readonly jellyseerrUrl?: string;
    readonly serverUrl?: string;
    readonly error?: string;
    /**
     * When Jellyseerr has no result (a title without a TMDB entry, say): the
     * title on the media server, found there by its name and year.
     */
    readonly serverMatch?: {
      readonly status: 'available' | 'partial';
      readonly itemUrl: string;
    };
    /** Prowlarr's address, for the "Find a release" button; absent when not set up. */
    readonly prowlarrUrl?: string;
  };
}

/**
 * Request to retrieve extension configuration.
 */
export interface GetConfigMessage {
  readonly type: 'GET_CONFIG';
}

/**
 * Response with the stored extension configuration.
 */
export interface GetConfigResponse {
  readonly type: 'GET_CONFIG_RESPONSE';
  readonly payload: {
    readonly serverType: 'emby' | 'jellyfin';
    readonly serverUrl: string;
    readonly localServerUrl: string;
    readonly apiKey: string;
    readonly jellyseerrEnabled: boolean;
    readonly jellyseerrUrl: string;
    readonly jellyseerrLocalUrl: string;
    readonly jellyseerrApiKey: string;
    /** UI language setting (`auto` follows the browser) */
    readonly language: 'auto' | 'en' | 'ru';
  };
}

/**
 * Request to save extension configuration.
 */
export interface SaveConfigMessage {
  readonly type: 'SAVE_CONFIG';
  readonly payload: {
    readonly serverType: 'emby' | 'jellyfin';
    readonly serverUrl: string;
    readonly localServerUrl: string;
    readonly apiKey: string;
    readonly jellyseerrEnabled: boolean;
    readonly jellyseerrUrl: string;
    readonly jellyseerrLocalUrl: string;
    readonly jellyseerrApiKey: string;
  };
}

/**
 * Response after saving configuration.
 */
export interface SaveConfigResponse {
  readonly type: 'SAVE_CONFIG_RESPONSE';
  readonly payload: {
    readonly success: boolean;
  };
}
