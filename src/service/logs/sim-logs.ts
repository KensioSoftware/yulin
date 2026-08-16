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
import { SimLogsAuthorizer } from "./command/authorize/sim-logs-authorizer.js";
import { SimLogsFilterLogEvents } from "./command/event/sim-logs-filter-log-events.js";
import { SimLogsGetLogEvents } from "./command/event/sim-logs-get-log-events.js";
import { SimLogsPutLogEvents } from "./command/event/sim-logs-put-log-events.js";
import { SimLogsLogGroupCommands } from "./command/group/sim-logs-log-group-commands.js";
import { SimLogsRetentionCommands } from "./command/group/sim-logs-retention-commands.js";
import type * as simLogsCommands from "./command/sim-logs-command.types.js";
import type { SimLogsRequestOptions } from "./command/sim-logs-request-options.js";
import { SimLogsLogStreamCommands } from "./command/stream/sim-logs-log-stream-commands.js";
import { SimLogsEventIds } from "./event/sim-logs-event-ids.js";
import type { SimLogsLogGroup } from "./group/sim-logs-log-group.js";
import { SimLogsLogGroupStore } from "./group/sim-logs-log-group-store.js";
import { SimLogsSdkCommandRouter } from "./sdk/sim-logs-sdk-command-router.js";

interface SimLogsProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated CloudWatch Logs. Handles SDK commands. Emulates AWS behaviour and
 * state.
 *
 * Log groups are scoped to an account and region, as they are on real AWS: a
 * group name is unique within one of those scopes and its ARN names the
 * region.
 *
 * Nothing expires here. Retention is held as a property to assert on rather
 * than acted on, because a test would have to move the clock by months to see
 * an event expire, and what teams get wrong about retention is the value they
 * deployed rather than the deletion that eventually follows from it.
 */
export class SimLogs {
  readonly #groups: SimLogsLogGroupStore;
  readonly #groupCommands: SimLogsLogGroupCommands;
  readonly #retentionCommands: SimLogsRetentionCommands;
  readonly #streamCommands: SimLogsLogStreamCommands;
  readonly #putLogEventsCommand: SimLogsPutLogEvents;
  readonly #getLogEventsCommand: SimLogsGetLogEvents;
  readonly #filterLogEventsCommand: SimLogsFilterLogEvents;
  readonly #background: BackgroundScheduler;
  readonly #sdkRouter = new SimLogsSdkCommandRouter(this);

  constructor(properties: SimLogsProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    const authorizer = new SimLogsAuthorizer({ iam, accountRegionScope });
    const groups = new SimLogsLogGroupStore({ accountRegionScope });
    const eventIds = new SimLogsEventIds();

    this.#background = background;
    this.#groups = groups;
    this.#groupCommands = new SimLogsLogGroupCommands({
      groups,
      authorizer,
      clock: background,
    });
    this.#retentionCommands = new SimLogsRetentionCommands({
      groups,
      authorizer,
    });
    this.#streamCommands = new SimLogsLogStreamCommands({
      groups,
      authorizer,
      clock: background,
    });
    this.#putLogEventsCommand = new SimLogsPutLogEvents({
      groups,
      authorizer,
      eventIds,
      clock: background,
    });
    this.#getLogEventsCommand = new SimLogsGetLogEvents({ groups, authorizer });
    this.#filterLogEventsCommand = new SimLogsFilterLogEvents({
      groups,
      authorizer,
    });
  }

  /**
   * Find a log group by name.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting log
   * state without going through a Command and its authorization.
   */
  findLogGroup(logGroupName: string): SimLogsLogGroup | undefined {
    return this.#groups.find(logGroupName);
  }

  /**
   * Every log group in this scope, in creation order.
   */
  allLogGroups(): readonly SimLogsLogGroup[] {
    return this.#groups.all;
  }

  /**
   * Handle a CreateLogGroup Command from the SDK.
   */
  async createLogGroup(
    command: simLogsCommands.SimCreateLogGroupCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimCreateLogGroupCommandOutput> {
    await this.#background.sequence();
    return this.#groupCommands.createLogGroup(command, options);
  }

  /**
   * Handle a DeleteLogGroup Command from the SDK.
   */
  async deleteLogGroup(
    command: simLogsCommands.SimDeleteLogGroupCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimDeleteLogGroupCommandOutput> {
    await this.#background.sequence();
    return this.#groupCommands.deleteLogGroup(command, options);
  }

  /**
   * Handle a DescribeLogGroups Command from the SDK.
   */
  async describeLogGroups(
    command: simLogsCommands.SimDescribeLogGroupsCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimDescribeLogGroupsCommandOutput> {
    await this.#background.sequence();
    return this.#groupCommands.describeLogGroups(command, options);
  }

  /**
   * Handle a PutRetentionPolicy Command from the SDK.
   */
  async putRetentionPolicy(
    command: simLogsCommands.SimPutRetentionPolicyCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimPutRetentionPolicyCommandOutput> {
    await this.#background.sequence();
    return this.#retentionCommands.putRetentionPolicy(command, options);
  }

  /**
   * Handle a DeleteRetentionPolicy Command from the SDK.
   */
  async deleteRetentionPolicy(
    command: simLogsCommands.SimDeleteRetentionPolicyCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimDeleteRetentionPolicyCommandOutput> {
    await this.#background.sequence();
    return this.#retentionCommands.deleteRetentionPolicy(command, options);
  }

  /**
   * Handle a CreateLogStream Command from the SDK.
   */
  async createLogStream(
    command: simLogsCommands.SimCreateLogStreamCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimCreateLogStreamCommandOutput> {
    await this.#background.sequence();
    return this.#streamCommands.createLogStream(command, options);
  }

  /**
   * Handle a DescribeLogStreams Command from the SDK.
   */
  async describeLogStreams(
    command: simLogsCommands.SimDescribeLogStreamsCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimDescribeLogStreamsCommandOutput> {
    await this.#background.sequence();
    return this.#streamCommands.describeLogStreams(command, options);
  }

  /**
   * Handle a PutLogEvents Command from the SDK.
   */
  async putLogEvents(
    command: simLogsCommands.SimPutLogEventsCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimPutLogEventsCommandOutput> {
    await this.#background.sequence();
    return this.#putLogEventsCommand.handle(command, options);
  }

  /**
   * Handle a GetLogEvents Command from the SDK.
   */
  async getLogEvents(
    command: simLogsCommands.SimGetLogEventsCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimGetLogEventsCommandOutput> {
    await this.#background.sequence();
    return this.#getLogEventsCommand.handle(command, options);
  }

  /**
   * Handle a FilterLogEvents Command from the SDK.
   */
  async filterLogEvents(
    command: simLogsCommands.SimFilterLogEventsCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimFilterLogEventsCommandOutput> {
    await this.#background.sequence();
    return this.#filterLogEventsCommand.handle(command, options);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.#sdkRouter;
  }
}
