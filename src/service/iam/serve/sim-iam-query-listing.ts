import type { SimQueryFields } from "../../../serve/http/api/query/sim-query-request.js";
import type { SimQueryOutput } from "../../../serve/http/api/query/sim-query-result.js";
import { queryMembers } from "../../../serve/http/api/query/sim-query-result.js";

/**
 * Read the paging a listing was asked for.
 *
 * IAM pages every listing the same way, with a `Marker` naming where to resume
 * and a `MaxItems` bounding the page. `MaxItems` arrives as text like every
 * other Query field, and the simulation checks it is a whole number in range,
 * so it is read back as a number here rather than handed on as a string it
 * would refuse.
 */
export function iamQueryListingInput(
  fields: SimQueryFields,
): Record<string, unknown> {
  const maxItems = fields.text("MaxItems");

  return {
    Marker: fields.text("Marker"),
    MaxItems: maxItems === undefined ? undefined : Number(maxItems),
  };
}

/**
 * Write the paging a listing answered with, which says whether there is more
 * to come and where the next page starts.
 */
export function iamQueryListingResult(output: SimQueryOutput): string {
  return queryMembers(output, ["IsTruncated", "Marker"]);
}
