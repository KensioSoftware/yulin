/* oxlint-disable security/detect-object-injection -- the member read here is
   the one the operation's own result writer named, out of the output that
   operation produced. */

import type { SimQueryOutput } from "../../../../serve/http/api/query/sim-query-result.js";
import { queryMembers } from "../../../../serve/http/api/query/sim-query-result.js";
import { isRecord } from "../../../../util/type-guard/record.js";
import { xmlElement } from "../../../../util/xml/xml-writer.js";

/**
 * Write one structure member, such as the `ForwardConfig` of an action or the
 * `State` of a load balancer.
 *
 * ELB nests structures several deep, and the Query layer writes the members of
 * a structure and the items of a list. A structure holding a structure is the
 * shape left between them, so the caller passes what to write inside it.
 */
export function elbV2QueryStructure(
  output: SimQueryOutput,
  name: string,
  write: (member: SimQueryOutput) => string,
): string {
  const member = output[name];

  return isRecord(member) ? xmlElement(name, write(member)) : "";
}

/**
 * Write where the next page of a describe starts, when there is one.
 */
export function elbV2QueryNextMarker(output: SimQueryOutput): string {
  return queryMembers(output, ["NextMarker"]);
}
