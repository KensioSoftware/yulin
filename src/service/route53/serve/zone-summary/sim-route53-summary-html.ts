/**
 * Escape text for inclusion in the hosted-zone summary page.
 *
 * Hosted-zone names and record values come from user templates and test code,
 * so they cannot be trusted to be HTML-safe. Escaping keeps the page correct
 * for names containing characters that would otherwise close a tag.
 */
export function escapeSimRoute53Html(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Render one table row from already-escaped or plain-text cell values.
 */
export function simRoute53TableRow(cells: readonly string[]): string {
  const renderedCells = cells
    .map((cell) => `<td>${escapeSimRoute53Html(cell)}</td>`)
    .join("");

  return `<tr>${renderedCells}</tr>`;
}
