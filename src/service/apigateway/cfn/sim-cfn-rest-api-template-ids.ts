import type { SimCfnRestApiTemplateMethod } from "./sim-cfn-rest-api-template.factory.js";

/**
 * The logical IDs the REST API template test factory names its Resources by.
 *
 * A path spells its own ID, so two methods under one path name one node and a
 * test asserting on a node can build the ID from the path it asked for.
 */

/**
 * The logical ID of the Resource carrying one path of the template's tree.
 *
 * A test asserting on a node names it through here, so the naming stays in one
 * place. The path spells the ID, so two methods under one path name one node.
 */
export function simCfnRestApiResourceLogicalId(
  path: readonly string[],
): string {
  return `Resource${path.map(pathPartLabel).join("")}`;
}

/**
 * The logical ID of the Resource carrying one method of the template's API.
 */
export function simCfnRestApiMethodLogicalId(
  method: SimCfnRestApiTemplateMethod,
): string {
  return `Method${method.httpMethod}${method.path.map(pathPartLabel).join("")}`;
}

/**
 * One path segment as part of a logical ID.
 *
 * A logical ID is alphanumeric, so anything else a path part carries is
 * spelled as its character code rather than dropped, and every segment is
 * prefixed. Dropping the punctuation and running the segments together would
 * give `{proxy}` and `{proxy+}` one ID, and give `orders/{id}` and `orders{id}`
 * another.
 */
function pathPartLabel(pathPart: string): string {
  const label = pathPart.replaceAll(
    /[^a-zA-Z0-9]/g,
    (character) =>
      /* v8 ignore next -- the pattern matches one character, which has a code point */
      `X${(character.codePointAt(0) ?? 0).toString(16)}`,
  );

  return `Part${label}`;
}
