import { SimAthenaInvalidRequestException } from "../error/sim-athena.error.js";
import type { SimAthenaNamedQuery } from "./sim-athena-named-query.js";

/**
 * The named queries of one simulated Athena scope.
 *
 * Keyed by id rather than by name. Athena lets two named queries share a name,
 * and the id is what every command after creation names one by.
 */
export class SimAthenaNamedQueryStore {
  private readonly namedQueries = new Map<string, SimAthenaNamedQuery>();

  /**
   * Every named query in this scope, in creation order.
   */
  get all(): readonly SimAthenaNamedQuery[] {
    return this.namedQueries.values().toArray();
  }

  /**
   * Store a named query.
   */
  put(namedQuery: SimAthenaNamedQuery): void {
    this.namedQueries.set(namedQuery.namedQueryId, namedQuery);
  }

  /**
   * Find a named query by id.
   */
  find(namedQueryId: string): SimAthenaNamedQuery | undefined {
    return this.namedQueries.get(namedQueryId);
  }

  /**
   * Resolve a named query by id, or refuse.
   */
  require(namedQueryId: string): SimAthenaNamedQuery {
    const found = this.find(namedQueryId);

    if (found === undefined) {
      throw new SimAthenaInvalidRequestException(
        `NamedQuery ${namedQueryId} is not found.`,
      );
    }

    return found;
  }

  /**
   * Every named query belonging to one workgroup, in creation order.
   */
  inWorkGroup(workGroupName: string): readonly SimAthenaNamedQuery[] {
    return this.all.filter(
      (namedQuery) => namedQuery.workGroupName === workGroupName,
    );
  }

  /**
   * Forget a deleted named query.
   */
  remove(namedQueryId: string): void {
    this.namedQueries.delete(namedQueryId);
  }

  /**
   * Forget every named query belonging to a workgroup.
   *
   * `DeleteWorkGroup` with `RecursiveDeleteOption` takes the workgroup's named
   * queries with it, which is what the flag is for.
   */
  removeInWorkGroup(workGroupName: string): void {
    for (const namedQuery of this.inWorkGroup(workGroupName)) {
      this.remove(namedQuery.namedQueryId);
    }
  }
}
