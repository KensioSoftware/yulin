import { SimAthenaInvalidRequestException } from "../../error/sim-athena.error.js";
import type { SimAthenaNamedQueryStore } from "../../named-query/sim-athena-named-query-store.js";
import { primaryWorkGroupName } from "../../workgroup/sim-athena-work-group-name.js";
import type { SimAthenaWorkGroupStore } from "../../workgroup/sim-athena-work-group-store.js";

/**
 * Delete a workgroup, with the named queries in it where that was asked for.
 *
 * A workgroup holding named queries needs `RecursiveDeleteOption`, which takes
 * them with it. The `primary` workgroup cannot be deleted at all, because real
 * Athena makes it with the account and every request naming no workgroup lands
 * in it.
 */
export function deleteWorkGroupFrom(
  workGroups: SimAthenaWorkGroupStore,
  namedQueries: SimAthenaNamedQueryStore,
  name: string,
  recursiveDeleteOption: boolean | undefined,
): void {
  workGroups.require(name);

  if (name === primaryWorkGroupName) {
    throw new SimAthenaInvalidRequestException(
      `WorkGroup ${primaryWorkGroupName} cannot be deleted.`,
    );
  }

  if (
    recursiveDeleteOption !== true &&
    namedQueries.inWorkGroup(name).length > 0
  ) {
    throw new SimAthenaInvalidRequestException(
      `WorkGroup ${name} is not empty. Delete its named queries first, or ` +
        `set RecursiveDeleteOption.`,
    );
  }

  namedQueries.removeInWorkGroup(name);
  workGroups.remove(name);
}
