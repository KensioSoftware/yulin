import type { SimAthenaWorkGroupStore } from "../../workgroup/sim-athena-work-group-store.js";
import { requiredWorkGroupName } from "../../workgroup/sim-athena-work-group-name.js";
import type { SimAthenaAuthorizer } from "../authorize/sim-athena-authorizer.js";
import { SimAthenaPage } from "../sim-athena-page.js";
import type { SimAthenaRequestOptions } from "../sim-athena-request-options.js";
import {
  describedWorkGroup,
  listedWorkGroup,
} from "./sim-athena-described-work-group.js";
import type * as commands from "./work-group.command.js";

interface SimAthenaWorkGroupReadsProperties {
  readonly workGroups: SimAthenaWorkGroupStore;
  readonly authorizer: SimAthenaAuthorizer;
}

/**
 * The commands that read workgroups without changing any.
 */
export class SimAthenaWorkGroupReads {
  private readonly workGroups: SimAthenaWorkGroupStore;
  private readonly authorizer: SimAthenaAuthorizer;

  constructor(properties: SimAthenaWorkGroupReadsProperties) {
    this.workGroups = properties.workGroups;
    this.authorizer = properties.authorizer;
  }

  /**
   * Describe a workgroup, with the configuration it was created with.
   */
  getWorkGroup(
    command: commands.SimGetWorkGroupCommand,
    options?: SimAthenaRequestOptions,
  ): commands.SimGetWorkGroupCommandOutput {
    const name = requiredWorkGroupName("WorkGroup", command.input.WorkGroup);

    this.authorizer.authorizeWorkGroup("athena:GetWorkGroup", name, options);

    return {
      $metadata: {},
      WorkGroup: describedWorkGroup(this.workGroups.require(name)),
    };
  }

  /**
   * List the workgroups of this scope, in creation order.
   */
  listWorkGroups(
    command: commands.SimListWorkGroupsCommand,
    options?: SimAthenaRequestOptions,
  ): commands.SimListWorkGroupsCommandOutput {
    this.authorizer.authorizeAnyWorkGroup("athena:ListWorkGroups", options);

    const page = new SimAthenaPage(
      this.workGroups.all.map(listedWorkGroup),
      command.input.MaxResults,
      command.input.NextToken,
    );

    return { $metadata: {}, WorkGroups: page.items, NextToken: page.nextToken };
  }
}
