import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimAthenaNamedQueryStore } from "../../named-query/sim-athena-named-query-store.js";
import { requiredWorkGroupName } from "../../workgroup/sim-athena-work-group-name.js";
import type { SimAthenaWorkGroupStore } from "../../workgroup/sim-athena-work-group-store.js";
import type { SimAthenaAuthorizer } from "../authorize/sim-athena-authorizer.js";
import type { SimAthenaRequestOptions } from "../sim-athena-request-options.js";
import { createWorkGroupIn } from "./sim-athena-work-group-creation.js";
import { deleteWorkGroupFrom } from "./sim-athena-work-group-deletion.js";
import { updateWorkGroupIn } from "./sim-athena-work-group-update.js";
import type {
  SimCreateWorkGroupCommand,
  SimCreateWorkGroupCommandOutput,
  SimDeleteWorkGroupCommand,
  SimDeleteWorkGroupCommandOutput,
  SimUpdateWorkGroupCommand,
  SimUpdateWorkGroupCommandOutput,
} from "./work-group.command.js";

/** What one simulated Athena scope's workgroup writes are built from. */
interface SimAthenaWorkGroupWritesProperties {
  readonly workGroups: SimAthenaWorkGroupStore;
  readonly namedQueries: SimAthenaNamedQueryStore;
  readonly authorizer: SimAthenaAuthorizer;
  readonly clock: SimClock;
}

/**
 * The commands that create, update and delete workgroups.
 *
 * Each one authorizes the caller and hands the work to the rules for that
 * change, which live beside this file. What a create, an update and a delete
 * mean has nothing in common beyond the workgroup they name.
 */
export class SimAthenaWorkGroupWrites {
  readonly #properties: SimAthenaWorkGroupWritesProperties;

  constructor(properties: SimAthenaWorkGroupWritesProperties) {
    this.#properties = properties;
  }

  /** Create a workgroup. */
  createWorkGroup(
    command: SimCreateWorkGroupCommand,
    options?: SimAthenaRequestOptions,
  ): SimCreateWorkGroupCommandOutput {
    const { workGroups, clock } = this.#properties;
    const name = this.authorized(
      "CreateWorkGroup",
      command.input.Name,
      options,
    );

    createWorkGroupIn(workGroups, clock, name, command.input);

    return { $metadata: {} };
  }

  /** Update a workgroup's description, state or configuration. */
  updateWorkGroup(
    command: SimUpdateWorkGroupCommand,
    options?: SimAthenaRequestOptions,
  ): SimUpdateWorkGroupCommandOutput {
    const input = command.input;
    const name = this.authorized("UpdateWorkGroup", input.WorkGroup, options);

    updateWorkGroupIn(this.#properties.workGroups, name, input);

    return { $metadata: {} };
  }

  /** Delete a workgroup, with its named queries where that was asked for. */
  deleteWorkGroup(
    command: SimDeleteWorkGroupCommand,
    options?: SimAthenaRequestOptions,
  ): SimDeleteWorkGroupCommandOutput {
    const { workGroups, namedQueries } = this.#properties;
    const input = command.input;
    const name = this.authorized("DeleteWorkGroup", input.WorkGroup, options);

    deleteWorkGroupFrom(
      workGroups,
      namedQueries,
      name,
      input.RecursiveDeleteOption,
    );

    return { $metadata: {} };
  }

  /**
   * Read the workgroup a request names, and check the caller may act on it.
   *
   * `CreateWorkGroup` calls the field `Name` and everything else calls it
   * `WorkGroup`, so the refusal for a missing one has to know which command
   * asked.
   */
  private authorized(
    operation: string,
    field: string | undefined,
    options: SimAthenaRequestOptions | undefined,
  ): string {
    const isCreate = operation === "CreateWorkGroup";
    const name = requiredWorkGroupName(isCreate ? "Name" : "WorkGroup", field);

    this.#properties.authorizer.authorizeWorkGroup(
      `athena:${operation}`,
      name,
      options,
    );

    return name;
  }
}
