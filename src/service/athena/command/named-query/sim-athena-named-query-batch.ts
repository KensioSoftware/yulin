import { SimAthenaInvalidRequestException } from "../../error/sim-athena.error.js";
import type { SimAthenaNamedQueryStore } from "../../named-query/sim-athena-named-query-store.js";
import type { SimAthenaAuthorizer } from "../authorize/sim-athena-authorizer.js";
import type { SimAthenaRequestOptions } from "../sim-athena-request-options.js";
import { describedNamedQuery } from "./sim-athena-described-named-query.js";
import type * as commands from "./named-query.command.js";

/**
 * The most ids one `BatchGetNamedQuery` takes.
 */
const maximumBatchIds = 50;

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
  requestedIds: readonly string[] | undefined,
  options: SimAthenaRequestOptions | undefined,
): commands.SimBatchGetNamedQueryCommandOutput {
  const ids = requiredBatchIds(requestedIds);
  const found: commands.SimAthenaDescribedNamedQuery[] = [];
  const unprocessed: commands.SimAthenaUnprocessedNamedQueryId[] = [];

  for (const namedQueryId of ids) {
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

/**
 * The ids a batch names, refusing a request Athena would not take.
 *
 * `NamedQueryIds` is required, and Athena takes between one and fifty of them.
 * An empty batch is refused rather than answered with nothing, which would
 * read to a caller as fifty ids that matched nothing.
 */
function requiredBatchIds(
  requestedIds: readonly string[] | undefined,
): readonly string[] {
  if (requestedIds === undefined || requestedIds.length === 0) {
    throw new SimAthenaInvalidRequestException(
      "NamedQueryIds is required, and holds between 1 and " +
        `${String(maximumBatchIds)} ids`,
    );
  }

  if (requestedIds.length > maximumBatchIds) {
    throw new SimAthenaInvalidRequestException(
      `NamedQueryIds holds ${String(requestedIds.length)} ids, and Athena ` +
        `takes at most ${String(maximumBatchIds)}`,
    );
  }

  return requestedIds;
}
