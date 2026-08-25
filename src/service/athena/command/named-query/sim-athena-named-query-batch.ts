import type { SimAthenaNamedQueryStore } from "../../named-query/sim-athena-named-query-store.js";
import type { SimAthenaAuthorizer } from "../authorize/sim-athena-authorizer.js";
import type { SimAthenaRequestOptions } from "../sim-athena-request-options.js";
import { describedNamedQuery } from "./sim-athena-described-named-query.js";
import type * as commands from "./named-query.command.js";

/**
 * Answer one `BatchGetNamedQuery`.
 *
 * An id nothing matches is reported under `UnprocessedNamedQueryIds` rather
 * than failing the whole batch, which is how Athena answers. A query the
 * caller may not read is a denial, because that is a decision about the
 * caller rather than about the id.
 */
export function batchOfNamedQueries(
  namedQueries: SimAthenaNamedQueryStore,
  authorizer: SimAthenaAuthorizer,
  requestedIds: readonly string[],
  options: SimAthenaRequestOptions | undefined,
): commands.SimBatchGetNamedQueryCommandOutput {
  const found: commands.SimAthenaDescribedNamedQuery[] = [];
  const unprocessed: commands.SimAthenaUnprocessedNamedQueryId[] = [];

  for (const namedQueryId of requestedIds) {
    const namedQuery = namedQueries.find(namedQueryId);

    if (namedQuery === undefined) {
      unprocessed.push({
        NamedQueryId: namedQueryId,
        ErrorCode: "INVALID_INPUT",
        ErrorMessage: `NamedQuery ${namedQueryId} is not found.`,
      });

      continue;
    }

    authorizer.authorizeWorkGroup(
      "athena:BatchGetNamedQuery",
      namedQuery.workGroupName,
      options,
    );
    found.push(describedNamedQuery(namedQuery));
  }

  return {
    $metadata: {},
    NamedQueries: found,
    UnprocessedNamedQueryIds: unprocessed,
  };
}
