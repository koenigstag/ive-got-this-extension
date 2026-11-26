import { LitElement, html, css } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { property } from 'lit/decorators.js';
import {
  COMBINED_SVG,
  buildStatusBadge,
  openExtensionSettings,
} from '../../content-scripts/common-ui.js';
import { dialogTargetFromResult, openMediaDialog } from '../../content-scripts/media-dialog.js';
import type { SearchJellyseerrResponse, JellyseerrResultItem } from '../../types/messages.js';
import { t } from '../../i18n/index.js';

export class SearchSidebar extends LitElement {
  @property({ type: Object })
  response?: SearchJellyseerrResponse;

  @property({ type: String })
  queryTitle: string = '';

  static styles = css`
    :host {
      display: block;
      font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(145deg, #1a1130 0%, #120d20 100%);
      border: 1px solid rgba(123, 47, 190, 0.35);
      border-radius: 16px;
      padding: 20px;
      color: #e8e0f0;
      max-width: 360px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45);
      margin-block: 1rem;
      font-size: 14px;
      line-height: 1.5;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .header-icon {
      width: 32px;
      height: 32px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .header-title {
      font-weight: 700;
      font-size: 15px;
      color: #d0bcff;
    }

    .header-subtitle {
      font-size: 11px;
      color: #a89cc0;
      margin-top: 2px;
    }

    .settings-btn {
      margin-left: auto;
      align-self: flex-start;
      padding: 4px 7px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #a89cc0;
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      transition:
        background 0.15s,
        color 0.15s;
    }

    .settings-btn:hover,
    .settings-btn:focus-visible {
      background: rgba(255, 255, 255, 0.08);
      color: #d0bcff;
    }

    .info-row .open-settings {
      margin-top: 8px;
      padding: 5px 12px;
      border: none;
      border-radius: 6px;
      background: #7b2fbe;
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.4;
      cursor: pointer;
    }

    .info-row .open-settings:hover {
      background: #5e1f9b;
    }

    .result-row {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
      align-items: flex-start;
    }

    .result-row:not(:first-of-type) {
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      padding-top: 12px;
    }

    .poster {
      width: 60px;
      min-width: 60px;
      height: 90px;
      border-radius: 8px;
      overflow: hidden;
      background: #2a2040;
      flex-shrink: 0;
    }

    .poster img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .poster-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
    }

    .info {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
      min-width: 0;
    }

    .title {
      font-weight: 600;
      font-size: 14px;
      color: #f0e8ff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .type-label {
      font-size: 11px;
      color: #a89cc0;
    }

    .actions {
      margin-top: 6px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .info-row {
      padding: 8px 0;
    }

    .info-row-title {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 4px;
    }

    .info-row-desc {
      font-size: 12px;
      color: #a89cc0;
    }
  `;

  render() {
    if (!this.response) return nothing;

    const { results, jellyseerrEnabled, serverType, error } = this.response.payload;
    const serverLabel = serverType === 'jellyfin' ? 'Jellyfin' : 'Emby';

    return html`
      <div class="header">
        <div class="header-icon">
          ${unsafeHTML(COMBINED_SVG.replace(/width="48" height="48"/, 'width="32" height="32"'))}
        </div>
        <div>
          <div class="header-title">I've got this!</div>
          <div class="header-subtitle">${t('poweredBy', serverLabel)}</div>
        </div>
        <button
          class="settings-btn"
          title="${t('extensionSettings')}"
          aria-label="${t('extensionSettings')}"
          @click="${this._openSettings}"
        >
          ⚙︎
        </button>
      </div>

      ${!jellyseerrEnabled
        ? this._renderInfoRow(
            '⚙️',
            t('jellyseerrNotConfigured'),
            t('jellyseerrNotConfiguredSettings'),
            html`<button class="open-settings" @click="${this._openSettings}">
              ${t('openSettings')}
            </button>`,
          )
        : error
          ? this._renderInfoRow('⚠️', t('connectionError'), error)
          : results.length === 0
            ? this._renderInfoRow('🔍', t('noResults'), t('notFoundOnJellyseerr', this.queryTitle))
            : results.map((item) => this._renderResultRow(item, serverLabel))}
    `;
  }

  private _renderInfoRow(emoji: string, title: string, desc: string, action?: unknown) {
    return html`
      <div class="info-row">
        <div class="info-row-title">${emoji} ${title}</div>
        <div class="info-row-desc">${desc}</div>
        ${action ?? nothing}
      </div>
    `;
  }

  private _openSettings() {
    void openExtensionSettings();
  }

  private _renderResultRow(item: JellyseerrResultItem, serverLabel: string) {
    const typeLabel = item.mediaType === 'movie' ? t('typeMovie') : t('typeTvShow');
    const yearStr = item.year ? ` (${item.year})` : '';
    const jellyseerrUrl = this.response?.payload.jellyseerrUrl;

    return html`
      <div class="result-row">
        <div class="poster">
          ${item.posterUrl
            ? html`<img src="${item.posterUrl}" alt="${item.title}" />`
            : html`<div class="poster-placeholder">🎬</div>`}
        </div>
        <div class="info">
          <div class="title" title="${item.title}${yearStr}">${item.title}${yearStr}</div>
          <div class="type-label">${typeLabel}</div>
          ${unsafeHTML(buildStatusBadge(item.status))}
          <div class="actions">${this._renderActions(item, serverLabel, jellyseerrUrl)}</div>
        </div>
      </div>
    `;
  }

  private _renderActions(item: JellyseerrResultItem, serverLabel: string, jellyseerrUrl?: string) {
    const isJellyfin = serverLabel === 'Jellyfin';
    const serverBtnBg = isJellyfin ? '#00A4DC' : '#4CAF50';

    if (item.status === 'available' || item.status === 'partial') {
      return html`
        ${item.serverItemUrl
          ? html`<button
              @click="${() => window.open(item.serverItemUrl, '_blank')}"
              style="display: inline-block; padding: 5px 12px; border: none; border-radius: 6px; background: ${serverBtnBg}; color: #fff; fontSize: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s; line-height: 1.4;"
            >
              ▶ ${t('playOnServer', serverLabel)}
            </button>`
          : nothing}
        ${jellyseerrUrl
          ? html`<button
              @click="${() => this._openDialog(item)}"
              style="display: inline-block; padding: 5px 12px; border: none; border-radius: 6px; background: #7B2FBE; color: #fff; fontSize: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s; line-height: 1.4;"
            >
              ${t('manageInJellyseerr')}
            </button>`
          : nothing}
      `;
    }

    if (item.status === 'pending' || item.status === 'processing') {
      return html`
        <button
          @click="${() => this._openDialog(item)}"
          style="display: inline-block; padding: 5px 12px; border: none; border-radius: 6px; background: #616161; color: #fff; fontSize: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s; line-height: 1.4;"
        >
          ⏳ ${t('requestPending')}
        </button>
      `;
    }

    return html`
      <button
        @click="${() => this._openDialog(item)}"
        style="display: inline-block; padding: 5px 12px; border: none; border-radius: 6px; background: #7B2FBE; color: #fff; fontSize: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s; line-height: 1.4;"
      >
        ＋ ${t('request')}
      </button>
    `;
  }

  /**
   * The Jellyseerr buttons open the media dialog: the title's state on the server and
   * in Jellyseerr, its requests, and for a series the seasons to request.
   */
  private _openDialog(item: JellyseerrResultItem) {
    openMediaDialog(dialogTargetFromResult(item));
  }
}

const nothing = html``;

// This module is bundled into the content script. Chrome gives content
// scripts no custom element registry (`customElements` is null in the
// isolated world), so `@customElement` threw on import and took the whole
// content script down on every site. Register only where a registry exists.
if (globalThis.customElements && !globalThis.customElements.get('search-sidebar')) {
  globalThis.customElements.define('search-sidebar', SearchSidebar);
}

declare global {
  interface HTMLElementTagNameMap {
    'search-sidebar': SearchSidebar;
  }
}
