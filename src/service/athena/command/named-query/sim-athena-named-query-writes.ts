import { randomUUID } from "node:crypto";
import { SimAthenaNamedQuery } from "../../named-query/sim-athena-named-query.js";
import type { SimAthenaNamedQueryStore } from "../../named-query/sim-athena-named-query-store.js";
import { requestedWorkGroupName } from "../../workgroup/sim-athena-work-group-name.js";
import type { SimAthenaWorkGroupStore } from "../../workgroup/sim-athena-work-group-store.js";
import type { SimAthenaAuthorizer } from "../authorize/sim-athena-authorizer.js";
import type { SimAthenaRequestOptions } from "../sim-athena-request-options.js";
import { requiredNamedQueryField } from "./sim-athena-named-query-field.js";
import type * as commands from "./named-query.command.js";

interface SimAthenaNamedQueryWritesProperties {
  readonly namedQueries: SimAthenaNamedQueryStore;
  readonly workGroups: SimAthenaWorkGroupStore;
  readonly authorizer: SimAthenaAuthorizer;
}

/**
 * The commands that save and delete named queries.
 */
export class SimAthenaNamedQueryWrites {
  private readonly namedQueries: SimAthenaNamedQueryStore;
  private readonly workGroups: SimAthenaWorkGroupStore;
  private readonly authorizer: SimAthenaAuthorizer;

  constructor(properties: SimAthenaNamedQueryWritesProperties) {
    this.namedQueries = properties.namedQueries;
    this.workGroups = properties.workGroups;
    this.authorizer = properties.authorizer;
  }

  /**
   * Save a named query, and answer with the id everything else names it by.
   *
   * The workgroup has to exist. Storing a named query against one that does
   * not would leave it unreachable, since `ListNamedQueries` reaches a named
   * query through its workgroup.
   */
  createNamedQuery(
    command: commands.SimCreateNamedQueryCommand,
    options?: SimAthenaRequestOptions,
  ): commands.SimCreateNamedQueryCommandOutput {
    const input = command.input;
    const workGroupName = requestedWorkGroupName(input.WorkGroup);

    this.authorizer.authorizeWorkGroup(
      "athena:CreateNamedQuery",
      workGroupName,
      options,
    );
    this.workGroups.require(workGroupName);

    const namedQuery = new SimAthenaNamedQuery({
      namedQueryId: randomUUID(),
      name: requiredNamedQueryField("Name", input.Name),
      database: requiredNamedQueryField("Database", input.Database),
      queryString: requiredNamedQueryField("QueryString", input.QueryString),
      description: input.Description,
      workGroupName,
    });

    this.namedQueries.put(namedQuery);

    return { $metadata: {}, NamedQueryId: namedQuery.namedQueryId };
  }

  /**
   * Delete a named query by id.
   */
  deleteNamedQuery(
    command: commands.SimDeleteNamedQueryCommand,
    options?: SimAthenaRequestOptions,
  ): commands.SimDeleteNamedQueryCommandOutput {
    const namedQuery = this.namedQueries.require(
      requiredNamedQueryField("NamedQueryId", command.input.NamedQueryId),
    );

    this.authorizer.authorizeWorkGroup(
      "athena:DeleteNamedQuery",
      namedQuery.workGroupName,
      options,
    );
    this.namedQueries.remove(namedQuery.namedQueryId);

    return { $metadata: {} };
  }
}
