import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import { SimLogsCfnResourceFactory } from "./cfn/sim-logs-cfn-resource-factory.js";
import type * as simLogsCommands from "./command/sim-logs-command.types.js";
import type { SimLogsRequestOptions } from "./command/sim-logs-request-options.js";
import type { SimLogsLogGroup } from "./group/sim-logs-log-group.js";
import { SimLogsSdkCommandRouter } from "./sdk/sim-logs-sdk-command-router.js";
import {
  SimLogsCommands,
  type SimLogsProperties,
} from "./sim-logs-commands.js";
import { SimLogsDeliveryOperations } from "./sim-logs-delivery-operations.js";
import type { SimLogsSubscriptionFailure } from "./subscription/sim-logs-subscription-fan-out.js";
import type { SimLogsServiceWriter } from "./write/sim-logs-service-writer.js";

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
 *
 * The delivery operations are held apart in `SimLogsDeliveryOperations`, which
 * this extends, because this file grows by one delegating method per simulated
 * operation and is at the length this codebase allows.
 */
export class SimLogs extends SimLogsDeliveryOperations {
  protected readonly commands: SimLogsCommands;

  readonly #sdkRouter = new SimLogsSdkCommandRouter(this);
  readonly #cfnFactory: SimLogsCfnResourceFactory;

  constructor(properties: SimLogsProperties = {}) {
    super();
    this.commands = new SimLogsCommands(properties);
    this.#cfnFactory = new SimLogsCfnResourceFactory({
      logs: this,
      authorizer: this.commands.authorizer,
      accountRegionScope: this.commands.accountRegionScope,
    });
  }

  /**
   * Find a log group by name.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting log
   * state without going through a Command and its authorization.
   */
  findLogGroup(logGroupName: string): SimLogsLogGroup | undefined {
    return this.commands.groups.find(logGroupName);
  }

  /**
   * Every log group in this scope, in creation order.
   */
  allLogGroups(): readonly SimLogsLogGroup[] {
    return this.commands.groups.all;
  }

  /**
   * How the rest of the simulation writes to a log group.
   *
   * Nothing authorizes on this path. A real Lambda function needs
   * `logs:CreateLogGroup` and `logs:PutLogEvents` on its execution Role, and
   * one without them produces no logs at all, in silence. Simulating that
   * would mean nearly every function in a test logged nothing with no failure
   * to explain why, so writing is unconditional and the divergence is
   * documented instead.
   */
  serviceWriter(): SimLogsServiceWriter {
    return this.commands.serviceWriter;
  }

  /**
   * Handle a CreateLogGroup Command from the SDK.
   */
  async createLogGroup(
    command: simLogsCommands.SimCreateLogGroupCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimCreateLogGroupCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.logGroups.createLogGroup(command, options);
  }

  /**
   * Handle a DeleteLogGroup Command from the SDK.
   */
  async deleteLogGroup(
    command: simLogsCommands.SimDeleteLogGroupCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimDeleteLogGroupCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.logGroups.deleteLogGroup(command, options);
  }

  /**
   * Handle a DescribeLogGroups Command from the SDK.
   */
  async describeLogGroups(
    command: simLogsCommands.SimDescribeLogGroupsCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimDescribeLogGroupsCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.logGroups.describeLogGroups(command, options);
  }

  /**
   * Handle a PutRetentionPolicy Command from the SDK.
   */
  async putRetentionPolicy(
    command: simLogsCommands.SimPutRetentionPolicyCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimPutRetentionPolicyCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.retention.putRetentionPolicy(command, options);
  }

  /**
   * Handle a DeleteRetentionPolicy Command from the SDK.
   */
  async deleteRetentionPolicy(
    command: simLogsCommands.SimDeleteRetentionPolicyCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimDeleteRetentionPolicyCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.retention.deleteRetentionPolicy(command, options);
  }

  /**
   * Handle a CreateLogStream Command from the SDK.
   */
  async createLogStream(
    command: simLogsCommands.SimCreateLogStreamCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimCreateLogStreamCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.streams.createLogStream(command, options);
  }

  /**
   * Handle a DescribeLogStreams Command from the SDK.
   */
  async describeLogStreams(
    command: simLogsCommands.SimDescribeLogStreamsCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimDescribeLogStreamsCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.streams.describeLogStreams(command, options);
  }

  /**
   * Handle a PutLogEvents Command from the SDK.
   */
  async putLogEvents(
    command: simLogsCommands.SimPutLogEventsCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimPutLogEventsCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.putLogEvents.handle(command, options);
  }

  /**
   * Handle a GetLogEvents Command from the SDK.
   */
  async getLogEvents(
    command: simLogsCommands.SimGetLogEventsCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimGetLogEventsCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.getLogEvents.handle(command, options);
  }

  /**
   * Handle a FilterLogEvents Command from the SDK.
   */
  async filterLogEvents(
    command: simLogsCommands.SimFilterLogEventsCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimFilterLogEventsCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.filterLogEvents.handle(command, options);
  }

  /**
   * Every subscription filter delivery this scope could not make.
   *
   * A failed delivery is invisible in an account, where it becomes a metric
   * nobody is watching. Keeping it is what lets a test find out that the
   * subscription it set up never reached anything.
   */
  get subscriptionFailures(): readonly SimLogsSubscriptionFailure[] {
    return this.commands.fanOut.failures;
  }

  /**
   * Handle a PutSubscriptionFilter Command from the SDK.
   */
  async putSubscriptionFilter(
    command: simLogsCommands.SimPutSubscriptionFilterCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimPutSubscriptionFilterCommandOutput> {
    await this.commands.background.sequence();
    return await this.commands.subscriptions.putSubscriptionFilter(
      command,
      options,
    );
  }

  /**
   * Handle a DescribeSubscriptionFilters Command from the SDK.
   */
  async describeSubscriptionFilters(
    command: simLogsCommands.SimDescribeSubscriptionFiltersCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimDescribeSubscriptionFiltersCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.subscriptions.describeSubscriptionFilters(
      command,
      options,
    );
  }

  /**
   * Handle a DeleteSubscriptionFilter Command from the SDK.
   */
  async deleteSubscriptionFilter(
    command: simLogsCommands.SimDeleteSubscriptionFilterCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimDeleteSubscriptionFilterCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.subscriptions.deleteSubscriptionFilter(
      command,
      options,
    );
  }

  /**
   * Get the CloudFormation Resource factory for AWS::Logs::* Resources.
   */
  cfnResourceFactory(): SimLogsCfnResourceFactory {
    return this.#cfnFactory;
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.#sdkRouter;
  }
}
