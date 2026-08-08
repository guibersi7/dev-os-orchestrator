/**
 * Slack's mark, vendored locally.
 *
 * Slack is not in simple-icons — it was removed at Slack's own request, along
 * with other brands that restrict redistribution. This is not a packaging bug
 * and it will not come back, so the mark has to be shipped as a local asset.
 *
 * To fill this in: take the one-color (not multicolor) Slack mark from Slack's
 * official brand kit, normalize it to `viewBox="0 0 24 24"` as a single path,
 * and paste the `d` attribute below. Then it accepts the same depth tint as
 * every other icon with no special case in the component.
 *
 * Until then `BrandIcon` renders the two-letter `sl` tag, which is honest.
 * Do not substitute a hand-drawn approximation or the multicolor version —
 * the first is wrong and the second breaks the palette.
 */
export const SLACK_ICON_PATH: string | null = null;
