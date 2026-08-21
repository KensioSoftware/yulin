/**
 * How far a message body is indented under the line that introduces it.
 */
export const bodyIndent = "  ";

/**
 * A body indented under the line introducing it, line by line, so a message
 * running to several lines stays one readable block.
 */
export function indented(
  body: string,
  indent: string = bodyIndent,
): readonly string[] {
  return body.split("\n").map((line) => `${indent}${line}`);
}
