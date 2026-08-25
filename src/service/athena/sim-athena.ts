import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import type * as simAthenaCommands from "./command/sim-athena-command.types.js";
import { SimAthenaCommands } from "./command/sim-athena-commands.js";
import type { SimAthenaRequestOptions } from "./command/sim-athena-request-options.js";
import { SimAthenaNamedQueryStore } from "./named-query/sim-athena-named-query-store.js";
import type { SimAthenaNamedQuery } from "./named-query/sim-athena-named-query.js";
import { SimAthenaCfnResourceFactory } from "./cfn/sim-athena-cfn-resource-factory.js";
import { SimAthenaSdkCommandRouter } from "./sdk/sim-athena-sdk-command-router.js";
import { SimAthenaWorkGroup } from "./workgroup/sim-athena-work-group.js";
import { primaryWorkGroupName } from "./workgroup/sim-athena-work-group-name.js";
import { SimAthenaWorkGroupStore } from "./workgroup/sim-athena-work-group-store.js";

interface SimAthenaProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated Amazon Athena. Handles SDK commands. Emulates AWS behaviour and
 * state.
 *
 * Workgroups and named queries are what this models. A workgroup holds the
 * settings a query would run under, and a named query holds SQL under a name.
 * Nothing runs a query and nothing reads the SQL, so a named query here is the
 * text a caller saved and a workgroup is the configuration a stack set.
 *
 * That is worth being plain about. A test can prove its stack configured the
 * bytes-scanned cutoff and its rollups were registered, and it cannot find out
 * whether the SQL is valid.
 *
 * Both resources are scoped to an account and region, as they are on real
 * Athena. Every scope starts with the `primary` workgroup, which real Athena
 * makes with the account.
 */
export class SimAthena {
  readonly #workGroups = new SimAthenaWorkGroupStore();
  readonly #namedQueries = new SimAthenaNamedQueryStore();
  readonly #commands: SimAthenaCommands;
  readonly #background: BackgroundScheduler;
  readonly #sdkRouter = new SimAthenaSdkCommandRouter(this);
  readonly #cfnFactory = new SimAthenaCfnResourceFactory({ athena: this });

  constructor(properties: SimAthenaProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.#background = background;
    this.#workGroups.put(
      new SimAthenaWorkGroup({
        name: primaryWorkGroupName,
        createdAt: background.now(),
      }),
    );
    this.#commands = new SimAthenaCommands({
      workGroups: this.#workGroups,
      namedQueries: this.#namedQueries,
      iam,
      accountRegionScope,
      clock: background,
    });
  }

  /**
   * Find a workgroup by name.
   *
   * The simulator's own accessor, for tests reading workgroup state without
   * going through a Command and its authorization.
   */
  findWorkGroup(name: string): SimAthenaWorkGroup | undefined {
    return this.#workGroups.find(name);
  }

  /**
   * Every named query in this scope, in creation order.
   *
   * The simulator's own accessor. `ListNamedQueries` answers with ids for one
   * workgroup at a time, which is more work than a test asserting that a
   * rollup was registered needs.
   */
  namedQueries(): readonly SimAthenaNamedQuery[] {
    return this.#namedQueries.all;
  }

  /**
   * Handle a CreateWorkGroup Command from the SDK.
   */
  async createWorkGroup(
    command: simAthenaCommands.SimCreateWorkGroupCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimCreateWorkGroupCommandOutput> {
    await this.#background.sequence();
    return this.#commands.workGroupWrites.createWorkGroup(command, options);
  }

  /**
   * Handle a GetWorkGroup Command from the SDK.
   */
  async getWorkGroup(
    command: simAthenaCommands.SimGetWorkGroupCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimGetWorkGroupCommandOutput> {
    await this.#background.sequence();
    return this.#commands.workGroupReads.getWorkGroup(command, options);
  }

  /**
   * Handle an UpdateWorkGroup Command from the SDK.
   */
  async updateWorkGroup(
    command: simAthenaCommands.SimUpdateWorkGroupCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimUpdateWorkGroupCommandOutput> {
    await this.#background.sequence();
    return this.#commands.workGroupWrites.updateWorkGroup(command, options);
  }

  /**
   * Handle a DeleteWorkGroup Command from the SDK.
   */
  async deleteWorkGroup(
    command: simAthenaCommands.SimDeleteWorkGroupCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimDeleteWorkGroupCommandOutput> {
    await this.#background.sequence();
    return this.#commands.workGroupWrites.deleteWorkGroup(command, options);
  }

  /**
   * Handle a ListWorkGroups Command from the SDK.
   */
  async listWorkGroups(
    command: simAthenaCommands.SimListWorkGroupsCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimListWorkGroupsCommandOutput> {
    await this.#background.sequence();
    return this.#commands.workGroupReads.listWorkGroups(command, options);
  }

  /**
   * Handle a CreateNamedQuery Command from the SDK.
   */
  async createNamedQuery(
    command: simAthenaCommands.SimCreateNamedQueryCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimCreateNamedQueryCommandOutput> {
    await this.#background.sequence();
    return this.#commands.namedQueryWrites.createNamedQuery(command, options);
  }

  /**
   * Handle a GetNamedQuery Command from the SDK.
   */
  async getNamedQuery(
    command: simAthenaCommands.SimGetNamedQueryCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimGetNamedQueryCommandOutput> {
    await this.#background.sequence();
    return this.#commands.namedQueryReads.getNamedQuery(command, options);
  }

  /**
   * Handle a BatchGetNamedQuery Command from the SDK.
   */
  async batchGetNamedQuery(
    command: simAthenaCommands.SimBatchGetNamedQueryCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimBatchGetNamedQueryCommandOutput> {
    await this.#background.sequence();
    return this.#commands.namedQueryReads.batchGetNamedQuery(command, options);
  }

  /**
   * Handle a ListNamedQueries Command from the SDK.
   */
  async listNamedQueries(
    command: simAthenaCommands.SimListNamedQueriesCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimListNamedQueriesCommandOutput> {
    await this.#background.sequence();
    return this.#commands.namedQueryReads.listNamedQueries(command, options);
  }

  /**
   * Handle a DeleteNamedQuery Command from the SDK.
   */
  async deleteNamedQuery(
    command: simAthenaCommands.SimDeleteNamedQueryCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimDeleteNamedQueryCommandOutput> {
    await this.#background.sequence();
    return this.#commands.namedQueryWrites.deleteNamedQuery(command, options);
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
