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
 * Do not substitute a hand-drawn approximation or the multicolor version —
 * the first is wrong and the second breaks the palette.
 */
export const SLACK_ICON_PATH =
  "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.522 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.522 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.522 2.521 2.528 2.528 0 0 1-2.522 2.522H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 0 1 2.52-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.522h-2.52V8.834zm-1.271 0a2.528 2.528 0 0 1-2.522 2.522 2.528 2.528 0 0 1-2.521-2.522V2.522A2.528 2.528 0 0 1 15.165 0a2.528 2.528 0 0 1 2.522 2.522v6.312zm-2.522 10.124a2.528 2.528 0 0 1 2.522 2.52A2.528 2.528 0 0 1 15.165 24a2.528 2.528 0 0 1-2.521-2.522v-2.52h2.521zm0-1.271a2.528 2.528 0 0 1-2.521-2.522 2.527 2.527 0 0 1 2.521-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.522h-6.313z";
