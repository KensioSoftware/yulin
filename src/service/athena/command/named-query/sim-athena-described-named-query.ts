import type { SimAthenaNamedQuery } from "../../named-query/sim-athena-named-query.js";
import type { SimAthenaDescribedNamedQuery } from "./named-query.command.js";

/**
 * One named query as a response carries it.
 */
export function describedNamedQuery(
  namedQuery: SimAthenaNamedQuery,
): SimAthenaDescribedNamedQuery {
  return {
    NamedQueryId: namedQuery.namedQueryId,
    Name: namedQuery.name,
    Description: namedQuery.description,
    Database: namedQuery.database,
    QueryString: namedQuery.queryString,
    WorkGroup: namedQuery.workGroupName,
  };
}
