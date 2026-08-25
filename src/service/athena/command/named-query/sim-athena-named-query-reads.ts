import type { SimAthenaNamedQueryStore } from "../../named-query/sim-athena-named-query-store.js";
import { requestedWorkGroupName } from "../../workgroup/sim-athena-work-group-name.js";
import type { SimAthenaWorkGroupStore } from "../../workgroup/sim-athena-work-group-store.js";
import type { SimAthenaAuthorizer } from "../authorize/sim-athena-authorizer.js";
import { SimAthenaPage } from "../sim-athena-page.js";
import type { SimAthenaRequestOptions } from "../sim-athena-request-options.js";
import { batchOfNamedQueries } from "./sim-athena-named-query-batch.js";
import { requiredNamedQueryField } from "./sim-athena-named-query-field.js";
import { describedNamedQuery } from "./sim-athena-described-named-query.js";
import type * as commands from "./named-query.command.js";

interface SimAthenaNamedQueryReadsProperties {
  readonly namedQueries: SimAthenaNamedQueryStore;
  readonly workGroups: SimAthenaWorkGroupStore;
  readonly authorizer: SimAthenaAuthorizer;
}

/**
 * The commands that read named queries without changing any.
 */
export class SimAthenaNamedQueryReads {
  private readonly namedQueries: SimAthenaNamedQueryStore;
  private readonly workGroups: SimAthenaWorkGroupStore;
  private readonly authorizer: SimAthenaAuthorizer;

  constructor(properties: SimAthenaNamedQueryReadsProperties) {
    this.namedQueries = properties.namedQueries;
    this.workGroups = properties.workGroups;
    this.authorizer = properties.authorizer;
  }

  /**
   * Read one named query back by id.
   */
  getNamedQuery(
    command: commands.SimGetNamedQueryCommand,
    options?: SimAthenaRequestOptions,
  ): commands.SimGetNamedQueryCommandOutput {
    const namedQuery = this.namedQueries.require(
      requiredNamedQueryField("NamedQueryId", command.input.NamedQueryId),
    );

    this.authorizer.authorizeWorkGroup(
      "athena:GetNamedQuery",
      namedQuery.workGroupName,
      options,
    );

    return { $metadata: {}, NamedQuery: describedNamedQuery(namedQuery) };
  }

  /**
   * Read several named queries back at once.
   */
  batchGetNamedQuery(
    command: commands.SimBatchGetNamedQueryCommand,
    options?: SimAthenaRequestOptions,
  ): commands.SimBatchGetNamedQueryCommandOutput {
    return batchOfNamedQueries(
      this.namedQueries,
      this.authorizer,
      command.input.NamedQueryIds ?? [],
      options,
    );
  }

  /**
   * List the ids of one workgroup's named queries, in creation order.
   */
  listNamedQueries(
    command: commands.SimListNamedQueriesCommand,
    options?: SimAthenaRequestOptions,
  ): commands.SimListNamedQueriesCommandOutput {
    const input = command.input;
    const workGroupName = requestedWorkGroupName(input.WorkGroup);

    this.authorizer.authorizeWorkGroup(
      "athena:ListNamedQueries",
      workGroupName,
      options,
    );
    this.workGroups.require(workGroupName);

    const page = new SimAthenaPage(
      this.namedQueries
        .inWorkGroup(workGroupName)
        .map((namedQuery) => namedQuery.namedQueryId),
      input.MaxResults,
      input.NextToken,
    );

    return {
      $metadata: {},
      NamedQueryIds: page.items,
      NextToken: page.nextToken,
    };
  }
}
