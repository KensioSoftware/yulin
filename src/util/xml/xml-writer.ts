/**
 * Writing the XML documents AWS REST services answer with.
 *
 * These build strings rather than a document tree, because an AWS response
 * body is written once and never read back, and the element order is fixed by
 * the shape being written.
 */

/**
 * An element wrapping already-written content.
 */
export function xmlElement(name: string, content: string): string {
  return `<${name}>${content}</${name}>`;
}

/**
 * An element holding one value, or nothing at all when the value is absent.
 *
 * An omitted member and a member holding an empty string are different facts
 * in an AWS response, so an absent value writes no element rather than an
 * empty one.
 */
export function xmlValue(
  name: string,
  value: string | number | boolean | Date | undefined,
): string {
  return value === undefined ? "" : xmlElement(name, xmlContent(value));
}

/**
 * A whole document, with the declaration real AWS services send.
 */
export function xmlDocument(rootName: string, content: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>${xmlElement(rootName, content)}`;
}

/**
 * A value in the form XML text carries it.
 *
 * A timestamp travels as ISO 8601, which is what the REST protocols use and
 * what an SDK parses a date back out of.
 */
function xmlContent(value: string | number | boolean | Date): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return escapeXmlText(String(value));
}

/**
 * Escape the characters that would otherwise be read as markup.
 */
export function escapeXmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
