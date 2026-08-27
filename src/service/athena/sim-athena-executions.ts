import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimIamInterServiceAuthZ } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simIamInRegion } from "../iam/authorize/sim-iam-region-auth-z.js";
import type * as simAthenaCommands from "./command/sim-athena-command.types.js";
import { SimAthenaCommands } from "./command/sim-athena-commands.js";
import type { SimAthenaRequestOptions } from "./command/sim-athena-request-options.js";
import { SimAthenaQueryEngine } from "./engine/sim-athena-query-engine.js";
import {
  simAthenaTableObjects,
  type SimAthenaTableObjects,
} from "./engine/sim-athena-table-objects.js";
import { SimAthenaQueryExecutionStore } from "./execution/sim-athena-query-execution-store.js";
import type { SimAthenaQueryExecution } from "./execution/sim-athena-query-execution.js";
import { SimAthenaNoResultDestination } from "./execution/sim-athena-no-result-destination.js";
import { SimAthenaQueryRunner } from "./execution/sim-athena-query-runner.js";
import type { SimAthenaScannedObjects } from "./execution/sim-athena-scanned-objects.js";
import {
  SimAthenaResultWriter,
  type SimAthenaResultDestination,
} from "./execution/sim-athena-result-writer.js";
import { SimAthenaNamedQueryStore } from "./named-query/sim-athena-named-query-store.js";
import { SimAthenaQueryResults } from "./result/sim-athena-query-results.js";
import type { SimAthenaCatalog } from "./table/sim-athena-table-resolution.js";
import { SimAthenaWorkGroup } from "./workgroup/sim-athena-work-group.js";
import { primaryWorkGroupName } from "./workgroup/sim-athena-work-group-name.js";
import { SimAthenaWorkGroupStore } from "./workgroup/sim-athena-work-group-store.js";

interface SimAthenaProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;

  /**
   * Where this scope's query results are written.
   *
   * A SimAthena built on its own has none, and a query that would write
   * results fails saying so. A Bucket only exists inside a SimAws.
   */
  readonly s3?: SimAthenaResultDestination & Partial<SimAthenaTableObjects>;

  /**
   * The Data Catalog a query's table names are resolved against.
   *
   * A SimAthena built on its own has none, and every query then runs without
   * its tables being looked for. A catalog only exists inside a SimAws.
   */
  readonly glue?: SimAthenaCatalog;
}

/**
 * Whether this destination can also list what a query reads.
 *
 * `SimS3` can. The no-op destination a standalone `SimAthena` gets cannot, and
 * a query there scans whatever a declaration says it scanned.
 */
function scannedObjects(
  s3: (SimAthenaResultDestination & Partial<SimAthenaTableObjects>) | undefined,
): SimAthenaScannedObjects | undefined {
  return s3?.listObjectsV2 === undefined
    ? undefined
    : (s3 as SimAthenaScannedObjects);
}

/**
 * Simulated Amazon Athena. Handles SDK commands. Emulates AWS behaviour and
 * state.
 *
 * Workgroups, named queries and query executions are what this models. A
 * workgroup holds the settings a query runs under, a named query holds SQL
 * under a name, and an execution is one run of a query.
 *
 * A named query's SQL is stored and handed back exactly as it was sent. A
 * running query is answered either from a declaration or by the query engine,
 * and `engine()` is what turns the engine on.
 *
 * Both resources are scoped to an account and region, as they are on real
 * Athena. Every scope starts with the `primary` workgroup, which real Athena
 * makes with the account.
 */
export class SimAthenaExecutions {
  protected readonly workGroupStore = new SimAthenaWorkGroupStore();
  protected readonly namedQueryStore = new SimAthenaNamedQueryStore();
  protected readonly commands: SimAthenaCommands;
  protected readonly background: BackgroundScheduler;
  readonly #executions = new SimAthenaQueryExecutionStore();
  readonly #results = new SimAthenaQueryResults();
  readonly #engine = new SimAthenaQueryEngine();

  constructor(properties: SimAthenaProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
    } = properties;

    const iam = simIamInRegion(properties.iam, accountRegionScope.regionName);

    const writer = new SimAthenaResultWriter({
      s3: properties.s3 ?? new SimAthenaNoResultDestination(),
    });
    const runner = new SimAthenaQueryRunner({
      results: this.#results,
      engine: this.#engine,
      workGroups: this.workGroupStore,
      writer,
      background,
      catalog: properties.glue,
      objects: scannedObjects(properties.s3),
      tableObjects: simAthenaTableObjects(properties.s3),
    });

    this.background = background;
    this.workGroupStore.put(
      new SimAthenaWorkGroup({
        name: primaryWorkGroupName,
        createdAt: background.now(),
      }),
    );
    this.commands = new SimAthenaCommands({
      workGroups: this.workGroupStore,
      namedQueries: this.namedQueryStore,
      executions: this.#executions,
      runner,
      iam,
      accountRegionScope,
      clock: background,
    });
  }

  /**
   * The results this scope answers queries with.
   *
   * The simulator's own accessor rather than an Athena operation. A
   * declaration written against one exact query text wins over the engine, and
   * the broader tiers answer whatever the engine turned down.
   */
  results(): SimAthenaQueryResults {
    return this.#results;
  }

  /**
   * The query engine this scope runs queries with.
   *
   * The simulator's own accessor rather than an Athena operation. It is off
   * until a test turns it on, and every query is answered from a declaration
   * until then.
   */
  engine(): SimAthenaQueryEngine {
    return this.#engine;
  }

  /**
   * Every query execution in this scope, oldest first.
   *
   * The simulator's own accessor, for a test reading back what ran without
   * polling for it.
   */
  queryExecutions(): readonly SimAthenaQueryExecution[] {
    return this.#executions.all;
  }

  /**
   * Handle a StartQueryExecution Command from the SDK.
   */
  async startQueryExecution(
    command: simAthenaCommands.SimStartQueryExecutionCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimStartQueryExecutionCommandOutput> {
    await this.background.sequence();
    return this.commands.executionWrites.startQueryExecution(command, options);
  }

  /**
   * Handle a GetQueryExecution Command from the SDK.
   */
  async getQueryExecution(
    command: simAthenaCommands.SimGetQueryExecutionCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimGetQueryExecutionCommandOutput> {
    await this.background.sequence();
    return this.commands.executionReads.getQueryExecution(command, options);
  }

  /**
   * Handle a GetQueryResults Command from the SDK.
   */
  async getQueryResults(
    command: simAthenaCommands.SimGetQueryResultsCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimGetQueryResultsCommandOutput> {
    await this.background.sequence();
    return this.commands.executionReads.getQueryResults(command, options);
  }

  /**
   * Handle a StopQueryExecution Command from the SDK.
   */
  async stopQueryExecution(
    command: simAthenaCommands.SimStopQueryExecutionCommand,
    options?: SimAthenaRequestOptions,
  ): Promise<simAthenaCommands.SimStopQueryExecutionCommandOutput> {
    await this.background.sequence();
    return this.commands.executionWrites.stopQueryExecution(command, options);
  }
}
