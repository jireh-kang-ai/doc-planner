/**
 * Extracts a Google document/spreadsheet ID from a full URL or returns the
 * input unchanged if it looks like a bare ID already.
 *
 * Handles URLs like:
 *   https://docs.google.com/document/d/DOCID/edit
 *   https://docs.google.com/spreadsheets/d/SHEETID/edit
 */
export function extractGoogleId(input: string): string {
  const match = input.match(/\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : input.trim()
}
