import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import type * as simAthenaCommands from "./command/sim-athena-command.types.js";
import { SimAthenaCommands } from "./command/sim-athena-commands.js";
import type { SimAthenaRequestOptions } from "./command/sim-athena-request-options.js";
import { SimAthenaQueryExecutionStore } from "./execution/sim-athena-query-execution-store.js";
import type { SimAthenaQueryExecution } from "./execution/sim-athena-query-execution.js";
import { SimAthenaNoResultDestination } from "./execution/sim-athena-no-result-destination.js";
import { SimAthenaQueryRunner } from "./execution/sim-athena-query-runner.js";
import type { SimAthenaScannedObjects } from "./execution/sim-athena-scanned-bytes.js";
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
  readonly s3?: SimAthenaResultDestination & Partial<SimAthenaScannedObjects>;

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
  s3:
    | (SimAthenaResultDestination & Partial<SimAthenaScannedObjects>)
    | undefined,
): SimAthenaScannedObjects | undefined {
  return s3?.listObjectsV2 === undefined
    ? undefined
    : (s3 as SimAthenaScannedObjects);
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
export class SimAthenaExecutions {
  protected readonly workGroupStore = new SimAthenaWorkGroupStore();
  protected readonly namedQueryStore = new SimAthenaNamedQueryStore();
  protected readonly commands: SimAthenaCommands;
  protected readonly background: BackgroundScheduler;
  readonly #executions = new SimAthenaQueryExecutionStore();
  readonly #results = new SimAthenaQueryResults();

  constructor(properties: SimAthenaProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    const writer = new SimAthenaResultWriter({
      s3: properties.s3 ?? new SimAthenaNoResultDestination(),
    });
    const runner = new SimAthenaQueryRunner({
      results: this.#results,
      workGroups: this.workGroupStore,
      writer,
      background,
      catalog: properties.glue,
      objects: scannedObjects(properties.s3),
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
   * The simulator's own accessor rather than an Athena operation. No SQL is
   * evaluated here, so a test says what a query answers with and the
   * simulation matches on the query text.
   */
  results(): SimAthenaQueryResults {
    return this.#results;
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
