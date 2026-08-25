import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type * as simAthenaCommands from "./command/sim-athena-command.types.js";
import type { SimAthenaRequestOptions } from "./command/sim-athena-request-options.js";
import type { SimAthenaNamedQuery } from "./named-query/sim-athena-named-query.js";
import { SimAthenaCfnResourceFactory } from "./cfn/sim-athena-cfn-resource-factory.js";
import { SimAthenaSdkCommandRouter } from "./sdk/sim-athena-sdk-command-router.js";
import { SimAthenaExecutions } from "./sim-athena-executions.js";
import type { SimAthenaWorkGroup } from "./workgroup/sim-athena-work-group.js";

/**
 * Simulated Amazon Athena. Handles SDK commands. Emulates AWS behaviour and
 * state.
 *
 * Workgroups, named queries and query executions are what this models. A
 * workgroup holds the settings a query runs under, a named query holds SQL
 * under a name, and an execution is one run of a query.
 *
 * No SQL is evaluated. A test declares what a query answers with through
 * `results()`, and the simulation reads the query text only as a key to match
 * that declaration on. So a test can prove its workgroup's bytes-scanned
 * cutoff refuses a query, that results land where the workgroup says, and that
 * a client polls the lifecycle correctly. Whether the SQL is valid stays out
 * of reach.
 *
 * Everything here is scoped to an account and region, as it is on real Athena.
 * Every scope starts with the `primary` workgroup, which real Athena makes
 * with the account.
 */
export class SimAthena extends SimAthenaExecutions {
  readonly #sdkRouter = new SimAthenaSdkCommandRouter(this);
  readonly #cfnFactory = new SimAthenaCfnResourceFactory({ athena: this });

  /**
   * Find a workgroup by name.
   *
   * The simulator's own accessor, for tests reading workgroup state without
   * going through a Command and its authorization.
   */
  findWorkGroup(name: string): SimAthenaWorkGroup | undefined {
    return this.workGroupStore.find(name);
  }

  /**
   * Every named query in this scope, in creation order.
   *
   * The simulator's own accessor. `ListNamedQueries` answers with ids for one
   * workgroup at a time, which is more work than a test asserting that a
   * rollup was registered needs.
   */
  namedQueries(): readonly SimAthenaNamedQuery[] {
    return this.namedQueryStore.all;
  }

  /**
   * Handle a CreateWorkGroup Command from the SDK.
   */
  async createWorkGroup(
    command: simAthenaCommands.SimCreateWorkGroupCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimCreateWorkGroupCommandOutput> {
    await this.background.sequence();
    return this.commands.workGroupWrites.createWorkGroup(command, options);
  }

  /**
   * Handle a GetWorkGroup Command from the SDK.
   */
  async getWorkGroup(
    command: simAthenaCommands.SimGetWorkGroupCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimGetWorkGroupCommandOutput> {
    await this.background.sequence();
    return this.commands.workGroupReads.getWorkGroup(command, options);
  }

  /**
   * Handle an UpdateWorkGroup Command from the SDK.
   */
  async updateWorkGroup(
    command: simAthenaCommands.SimUpdateWorkGroupCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimUpdateWorkGroupCommandOutput> {
    await this.background.sequence();
    return this.commands.workGroupWrites.updateWorkGroup(command, options);
  }

  /**
   * Handle a DeleteWorkGroup Command from the SDK.
   */
  async deleteWorkGroup(
    command: simAthenaCommands.SimDeleteWorkGroupCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimDeleteWorkGroupCommandOutput> {
    await this.background.sequence();
    return this.commands.workGroupWrites.deleteWorkGroup(command, options);
  }

  /**
   * Handle a ListWorkGroups Command from the SDK.
   */
  async listWorkGroups(
    command: simAthenaCommands.SimListWorkGroupsCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimListWorkGroupsCommandOutput> {
    await this.background.sequence();
    return this.commands.workGroupReads.listWorkGroups(command, options);
  }

  /**
   * Handle a CreateNamedQuery Command from the SDK.
   */
  async createNamedQuery(
    command: simAthenaCommands.SimCreateNamedQueryCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimCreateNamedQueryCommandOutput> {
    await this.background.sequence();
    return this.commands.namedQueryWrites.createNamedQuery(command, options);
  }

  /**
   * Handle a GetNamedQuery Command from the SDK.
   */
  async getNamedQuery(
    command: simAthenaCommands.SimGetNamedQueryCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimGetNamedQueryCommandOutput> {
    await this.background.sequence();
    return this.commands.namedQueryReads.getNamedQuery(command, options);
  }

  /**
   * Handle a BatchGetNamedQuery Command from the SDK.
   */
  async batchGetNamedQuery(
    command: simAthenaCommands.SimBatchGetNamedQueryCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimBatchGetNamedQueryCommandOutput> {
    await this.background.sequence();
    return this.commands.namedQueryReads.batchGetNamedQuery(command, options);
  }

  /**
   * Handle a ListNamedQueries Command from the SDK.
   */
  async listNamedQueries(
    command: simAthenaCommands.SimListNamedQueriesCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimListNamedQueriesCommandOutput> {
    await this.background.sequence();
    return this.commands.namedQueryReads.listNamedQueries(command, options);
  }

  /**
   * Handle a DeleteNamedQuery Command from the SDK.
   */
  async deleteNamedQuery(
    command: simAthenaCommands.SimDeleteNamedQueryCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimDeleteNamedQueryCommandOutput> {
    await this.background.sequence();
    return this.commands.namedQueryWrites.deleteNamedQuery(command, options);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.#sdkRouter;
  }

  /**
   * Get this service's CloudFormation Resource factory.
   */
  cfnResourceFactory(): SimAthenaCfnResourceFactory {
    return this.#cfnFactory;
  }
}
