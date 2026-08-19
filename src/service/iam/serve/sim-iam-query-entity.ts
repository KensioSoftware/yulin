/* oxlint-disable security/detect-object-injection -- the member read here is
   the one the operation's own result writer named, out of the output that
   operation produced. */

import { queryMembers } from "../../../serve/http/api/query/sim-query-result.js";
import type { SimQueryOutput } from "../../../serve/http/api/query/sim-query-result.js";
import { isRecord } from "../../../util/type-guard/record.js";
import { xmlElement } from "../../../util/xml/xml-writer.js";

/**
 * Write the one entity an IAM operation answers with, under the name it has.
 *
 * Every IAM create and get reports its subject as a structure rather than as
 * loose members: `CreateUser` answers a `User`, `GetRole` a `Role`, and the
 * same structures are what a listing repeats. The Query layer writes the
 * members of a structure and the items of a list, and this is the one shape
 * left between them.
 */
export function iamQueryEntity(
  output: SimQueryOutput,
  name: string,
  members: readonly string[],
): string {
  const entity = output[name];

  return isRecord(entity)
    ? xmlElement(name, queryMembers(entity, members))
    : "";
}
