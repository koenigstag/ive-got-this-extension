/**
 * A modal dialog with everything about the title on the page: what the media
 * server has, what Jellyseerr knows, and the buttons to open it or request it.
 *
 * It is a native `<dialog>` in the shadow root of a plain host element: the
 * shadow root keeps the site's CSS out, and `showModal()` puts it in the top
 * layer, above whatever the site stacks. No custom element is involved, since
 * Chrome gives content scripts no custom element registry.
 *
 * Templates come from `lit/html.js` alone: the main `lit` entry defines
 * LitElement, which must not be evaluated before the custom-elements polyfill
 * that the search sidebar installs (see `sites/search-engine.ts`).
 */
import { html, nothing, render, type TemplateResult } from 'lit/html.js';
import { openExtensionSettings, openInNewTab, sendMessage } from './common-ui.js';
import { getLanguage, t, type MessageKey } from '../i18n/index.js';
import type { DetectedMedia } from '../types/index.js';
import type {
  GetMediaDetailsMessage,
  JellyseerrResultItem,
  MediaDetailsResponse,
  MediaDetailsSeason,
  MediaRequestState,
  MediaStatusLabel,
  RequestMediaResponse,
} from '../types/messages.js';

export const MEDIA_DIALOG_HOST_ID = 'media-connector-dialog-host';

/** The title the dialog is about. */
export type MediaDialogTarget = GetMediaDetailsMessage['payload'];

/** The dialog's target for media detected on a page (a season or episode means its series). */
export const dialogTargetFromMedia = (media: DetectedMedia): MediaDialogTarget => ({
  title: media.type === 'season' || media.type === 'episode' ? media.seriesTitle : media.title,
  year: media.year,
  imdbId: media.imdbId,
  tmdbId: media.tmdbId,
  mediaType: media.type === 'movie' ? 'movie' : 'series',
});

/** The dialog's target for a Jellyseerr search result: its own TMDB ID, title and year. */
export const dialogTargetFromResult = (item: JellyseerrResultItem): MediaDialogTarget => ({
  title: item.title,
  year: item.year,
  tmdbId: String(item.id),
  mediaType: item.mediaType === 'movie' ? 'movie' : 'series',
});

type Details = MediaDetailsResponse['payload'];

type LoadState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'failed'; readonly message: string }
  | { readonly phase: 'ready'; readonly details: Details };

interface RequestResult {
  readonly ok: boolean;
  readonly message: string;
}

const STATUS_KEYS: Readonly<Record<MediaStatusLabel, MessageKey>> = {
  available: 'statusAvailable',
  partial: 'statusPartial',
  pending: 'statusPending',
  processing: 'statusProcessing',
  unknown: 'statusUnknown',
  not_requested: 'statusNotRequested',
};

const REQUEST_KEYS: Readonly<Record<MediaRequestState, MessageKey>> = {
  pending: 'requestStatePending',
  approved: 'requestStateApproved',
  declined: 'requestStateDeclined',
  failed: 'requestStateFailed',
  completed: 'requestStateCompleted',
};

const STYLES = /* css */ `
  dialog {
    box-sizing: border-box;
    width: min(460px, calc(100vw - 32px));
    max-height: min(80vh, 680px);
    padding: 0;
    border: none;
    border-radius: 12px;
    overflow: hidden;
    background: #1d1e22;
    color: #e8e8ea;
    color-scheme: dark;
    font:
      14px/1.45 system-ui,
      -apple-system,
      'Segoe UI',
      Roboto,
      sans-serif;
    text-align: left;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.6);
  }
  .body {
    display: flex;
    flex-direction: column;
    max-height: min(80vh, 680px);
  }
  header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px 16px 12px;
    border-bottom: 1px solid #2e2f35;
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
  .content {
    overflow-y: auto;
    padding: 0 16px 16px;
  }
  section {
    padding: 12px 0;
    border-bottom: 1px solid #2e2f35;
  }
  section:last-child {
    border-bottom: none;
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px;
    color: #9a9ba3;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  p {
    margin: 0 0 8px;
  }
  .muted {
    color: #9a9ba3;
    font-weight: 400;
  }
  .error {
    color: #ff8a80;
  }
  .chip {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    background: #34353c;
    color: #d0d0d6;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: normal;
    text-transform: none;
    white-space: nowrap;
  }
  .chip.available {
    background: rgba(82, 181, 75, 0.2);
    color: #7ddc76;
  }
  .chip.partial {
    background: rgba(255, 152, 0, 0.2);
    color: #ffb74d;
  }
  .chip.pending,
  .chip.processing {
    background: rgba(124, 58, 237, 0.25);
    color: #c4b5fd;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  button {
    padding: 7px 14px;
    border: 1px solid #3a3b42;
    border-radius: 8px;
    background: #2a2b31;
    color: inherit;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: #34353c;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  button.primary {
    border-color: #6d28d9;
    background: #6d28d9;
    color: #fff;
  }
  button.primary:hover:not(:disabled) {
    background: #7c3aed;
  }
  button.server {
    border-color: var(--server-color);
    color: var(--server-color);
  }
  button.close {
    padding: 0 4px;
    border: none;
    background: none;
    color: #9a9ba3;
    font-size: 22px;
    line-height: 1;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .seasons li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
    border-top: 1px solid #26272c;
  }
  .seasons li:first-child {
    border-top: none;
  }
  .seasons label {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .seasons input {
    accent-color: #7c3aed;
  }
  .count {
    color: #9a9ba3;
    font-size: 12px;
  }
  .requests li {
    color: #c4c5cc;
    font-size: 13px;
  }
  .seasons-block h3 {
    margin-top: 12px;
  }
  .result {
    margin-top: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 13px;
    white-space: pre-line;
  }
  .result.ok {
    background: rgba(82, 181, 75, 0.15);
  }
  .result.fail {
    background: rgba(255, 82, 82, 0.15);
  }
`;

/**
 * Give the shadow root its styles: a constructed stylesheet, which the page's
 * CSP does not govern, or a <style> element where those are missing.
 */
const applyStyles = (root: ShadowRoot): void => {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(STYLES);
    root.adoptedStyleSheets = [sheet];
  } catch {
    const style = document.createElement('style');
    style.textContent = STYLES;
    root.appendChild(style);
  }
};

const statusChip = (status: MediaStatusLabel | undefined) =>
  status ? html`<span class="chip ${status}">${t(STATUS_KEYS[status])}</span>` : nothing;

const formatDate = (iso: string | undefined): string | undefined => {
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleDateString(getLanguage());
};

const episodesText = (season: MediaDetailsSeason, onServer: boolean): string | undefined => {
  if (onServer && season.serverEpisodeCount !== undefined) {
    return season.episodeCount !== undefined
      ? t('dialogEpisodesOnServer', season.serverEpisodeCount, season.episodeCount)
      : t('dialogEpisodesOnServerOnly', season.serverEpisodeCount);
  }
  return season.episodeCount !== undefined ? t('dialogEpisodes', season.episodeCount) : undefined;
};

/**
 * Open the dialog for a title. An open dialog is replaced.
 */
export const openMediaDialog = (target: MediaDialogTarget): void => {
  document.getElementById(MEDIA_DIALOG_HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = MEDIA_DIALOG_HOST_ID;
  // Keys typed in the dialog are not the site's shortcuts.
  for (const type of ['keydown', 'keyup', 'keypress']) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }
  const root = host.attachShadow({ mode: 'open' });
  applyStyles(root);
  document.body.appendChild(host);

  let state: LoadState = { phase: 'loading' };
  let selected = new Set<number>();
  let sending = false;
  let result: RequestResult | undefined;

  const dialog = (): HTMLDialogElement | null => root.querySelector('dialog');
  const close = (): void => dialog()?.close();

  const load = async (): Promise<void> => {
    const response = await sendMessage<
      MediaDetailsResponse | { type: 'ERROR'; payload: { message: string } }
    >({
      type: 'GET_MEDIA_DETAILS',
      payload: target,
    });
    if (response?.type === 'MEDIA_DETAILS_RESPONSE') {
      state = { phase: 'ready', details: response.payload };
      selected = new Set(
        response.payload.seasons.filter((s) => s.requestable).map((s) => s.seasonNumber),
      );
    } else {
      state = {
        phase: 'failed',
        message: response?.type === 'ERROR' ? response.payload.message : t('unknownError'),
      };
    }
    update();
  };

  const sendRequest = async (details: Details): Promise<void> => {
    const seerr = details.jellyseerr;
    if (seerr.state !== 'found') return;
    sending = true;
    result = undefined;
    update();

    const response = await sendMessage<RequestMediaResponse>({
      type: 'REQUEST_MEDIA',
      payload: {
        title: target.title,
        year: target.year,
        tmdbId: String(seerr.tmdbId),
        mediaType: target.mediaType,
        seasons: target.mediaType === 'series' ? [...selected].sort((a, b) => a - b) : undefined,
      },
    });
    const ok = !!response?.payload?.success;
    result = { ok, message: response?.payload?.message || t('unknownError') };
    sending = false;
    if (ok) {
      // Show the new state of the title and its seasons.
      await load();
    } else {
      update();
    }
  };

  const toggleSeason = (seasonNumber: number, checked: boolean): void => {
    if (checked) selected.add(seasonNumber);
    else selected.delete(seasonNumber);
    update();
  };

  const serverSection = (details: Details): TemplateResult => {
    const label = details.serverType === 'jellyfin' ? 'Jellyfin' : 'Emby';
    const color = details.serverType === 'jellyfin' ? '#00a4dc' : '#52b54b';
    const server = details.server;
    let body: TemplateResult;
    if (server.state === 'found') {
      body = html`
        <p>
          ${t('dialogOnServer', label)} <strong>${server.name}</strong>
          ${server.year ? html`<span class="muted">(${server.year})</span>` : nothing}
        </p>
        <div class="actions">
          <button
            class="server"
            style="--server-color: ${color}"
            @click=${() => openInNewTab(server.itemUrl)}
          >
            ${t('dialogOpenOnServer', label)}
          </button>
        </div>
      `;
    } else if (server.state === 'unconfigured') {
      body = html`
        <p class="muted">${t('dialogServerUnconfigured', label)}</p>
        <div class="actions">
          <button @click=${() => openExtensionSettings()}>${t('openSettings')}</button>
        </div>
      `;
    } else if (server.state === 'error') {
      body = html`<p class="error">${t('dialogServerError', label, server.message)}</p>`;
    } else {
      body = html`<p class="muted">${t('dialogNotOnServer', label)}</p>`;
    }
    return html`<section class="server-section">
      <h3>${label}</h3>
      ${body}
    </section>`;
  };

  const seasonsList = (details: Details): TemplateResult | typeof nothing => {
    if (details.seasons.length === 0) return nothing;
    const onServer = details.server.state === 'found';
    const canRequest = details.jellyseerr.state === 'found';
    return html`
      <h3>${t('dialogSeasons')}</h3>
      <ul class="seasons">
        ${details.seasons.map((season) => {
          const episodes = episodesText(season, onServer);
          return html`
            <li>
              <label>
                ${canRequest
                  ? html`<input
                      type="checkbox"
                      .checked=${selected.has(season.seasonNumber)}
                      ?disabled=${!season.requestable || sending}
                      @change=${(e: Event) =>
                        toggleSeason(season.seasonNumber, (e.target as HTMLInputElement).checked)}
                    />`
                  : nothing}
                <span>${t('dialogSeason', season.seasonNumber)}</span>
              </label>
              ${episodes ? html`<span class="count">${episodes}</span>` : nothing}
              ${statusChip(season.status)}
            </li>
          `;
        })}
      </ul>
    `;
  };

  const jellyseerrSection = (details: Details): TemplateResult => {
    const seerr = details.jellyseerr;
    let body: TemplateResult;
    if (seerr.state === 'found') {
      const isSeries = details.mediaType === 'series';
      const requestLabel = isSeries ? t('dialogRequestSeasons', selected.size) : t('request');
      body = html`
        <p>
          <strong>${seerr.title}</strong>
          ${seerr.year ? html`<span class="muted">(${seerr.year})</span>` : nothing}
        </p>
        ${seerr.requests.length > 0
          ? html`<ul class="requests">
              ${seerr.requests.map(
                (r) =>
                  html`<li>
                    ${r.requestedBy ? t('dialogRequestedBy', r.requestedBy) : nothing}
                    ${formatDate(r.createdAt) ? html`· ${formatDate(r.createdAt)}` : nothing} ·
                    ${t(REQUEST_KEYS[r.state])}
                  </li>`,
              )}
            </ul>`
          : nothing}
        <div class="seasons-block">${seasonsList(details)}</div>
        <div class="actions">
          ${seerr.requestable
            ? html`<button
                class="primary request"
                ?disabled=${sending || (isSeries && selected.size === 0)}
                @click=${() => sendRequest(details)}
              >
                ${sending ? t('requesting') : requestLabel}
              </button>`
            : nothing}
          <button @click=${() => openInNewTab(seerr.url)}>${t('dialogOpenInJellyseerr')}</button>
        </div>
      `;
    } else if (seerr.state === 'disabled') {
      body = html`
        <p class="muted">${t('dialogJellyseerrDisabled')}</p>
        ${seasonsList(details)}
        <div class="actions">
          <button @click=${() => openExtensionSettings()}>${t('openSettings')}</button>
        </div>
      `;
    } else if (seerr.state === 'error') {
      body = html`<p class="error">${t('dialogJellyseerrError', seerr.message)}</p>
        ${seasonsList(details)}`;
    } else {
      body = html`<p class="muted">${t('dialogJellyseerrNotFound')}</p>
        ${seasonsList(details)}`;
    }

    return html`
      <section class="jellyseerr-section">
        <h3>Jellyseerr ${seerr.state === 'found' ? statusChip(seerr.status) : nothing}</h3>
        ${body}
        ${result
          ? // One line: the message keeps its own line breaks (pre-line).
            html`<div class="result ${result.ok ? 'ok' : 'fail'}" role="status">
              ${result.message}
            </div>`
          : nothing}
      </section>
    `;
  };

  const content = (): TemplateResult => {
    if (state.phase === 'loading') return html`<p class="muted">${t('dialogLoading')}</p>`;
    if (state.phase === 'failed') {
      return html`<p class="error">${t('dialogLoadFailed', state.message)}</p>`;
    }
    return html`${serverSection(state.details)}${jellyseerrSection(state.details)}`;
  };

  const update = (): void => {
    render(
      html`
        <dialog
          aria-labelledby="media-dialog-title"
          @close=${() => host.remove()}
          @click=${(e: MouseEvent) => {
            // A click on the dialog element itself is a click on its backdrop.
            if (e.target === dialog()) close();
          }}
        >
          <div class="body">
            <header>
              <h2 id="media-dialog-title">
                ${target.title}
                ${target.year ? html`<span class="muted">(${target.year})</span>` : nothing}
              </h2>
              <button class="close" aria-label=${t('dialogClose')} @click=${close}>×</button>
            </header>
            <div class="content">${content()}</div>
          </div>
        </dialog>
      `,
      root,
    );
  };

  update();
  dialog()?.showModal();
  void load();
};
