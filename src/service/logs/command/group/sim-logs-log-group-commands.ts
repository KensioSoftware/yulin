import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimLogsLogGroup } from "../../group/sim-logs-log-group.js";
import { requiredSimLogsLogGroupName } from "../../group/sim-logs-log-group-name.js";
import type { SimLogsLogGroupStore } from "../../group/sim-logs-log-group-store.js";
import type { SimLogsAuthorizer } from "../authorize/sim-logs-authorizer.js";
import { SimLogsPage } from "../sim-logs-page.js";
import type { SimLogsRequestOptions } from "../sim-logs-request-options.js";
import type {
  SimCreateLogGroupCommand,
  SimCreateLogGroupCommandOutput,
  SimDeleteLogGroupCommand,
  SimDeleteLogGroupCommandOutput,
  SimDescribeLogGroupsCommand,
  SimDescribeLogGroupsCommandOutput,
  SimLogsLogGroupDetail,
} from "./group.command.js";
import { refuseUnsimulatedLogGroupInput } from "./sim-logs-unsimulated-group-input.js";

const maximumDescribeLimit = 50;

interface SimLogsLogGroupCommandsProperties {
  readonly groups: SimLogsLogGroupStore;
  readonly authorizer: SimLogsAuthorizer;
  readonly clock: SimClock;
}

/**
 * The commands that make, remove and describe log groups.
 */
export class SimLogsLogGroupCommands {
  readonly #groups: SimLogsLogGroupStore;
  readonly #authorizer: SimLogsAuthorizer;
  readonly #clock: SimClock;

  constructor(properties: SimLogsLogGroupCommandsProperties) {
    this.#groups = properties.groups;
    this.#authorizer = properties.authorizer;
    this.#clock = properties.clock;
  }

  /**
   * Make a log group.
   *
   * Creation is not idempotent on real CloudWatch Logs, so a name already in
   * use fails rather than answering with the group that is there.
   */
  createLogGroup(
    command: SimCreateLogGroupCommand,
    options?: SimLogsRequestOptions,
  ): SimCreateLogGroupCommandOutput {
    const logGroupName = requiredSimLogsLogGroupName(command.input.logGroupName);

    refuseUnsimulatedLogGroupInput(command.input);
    this.#authorizer.authorizeLogGroup(
      "logs:CreateLogGroup",
      logGroupName,
      options?.caller,
    );

    this.#groups.create(logGroupName, this.#clock.now().getTime());

    return { $metadata: {} };
  }

  /**
   * Remove a log group, and the streams and events it holds with it.
   */
  deleteLogGroup(
    command: SimDeleteLogGroupCommand,
    options?: SimLogsRequestOptions,
  ): SimDeleteLogGroupCommandOutput {
    const logGroupName = requiredSimLogsLogGroupName(command.input.logGroupName);

    this.#authorizer.authorizeLogGroup(
      "logs:DeleteLogGroup",
      logGroupName,
      options?.caller,
    );

    this.#groups.require(logGroupName);
    this.#groups.delete(logGroupName);

    return { $metadata: {} };
  }

  /**
   * Describe the log groups in this scope, oldest first.
   *
   * Real CloudWatch Logs gives this action no group-level permission worth
   * scoping, so it authorizes against every log group in the account and
   * region rather than against each one it reports.
   */
  describeLogGroups(
    command: SimDescribeLogGroupsCommand,
    options?: SimLogsRequestOptions,
  ): SimDescribeLogGroupsCommandOutput {
    const input = command.input;

    this.#authorizer.authorizeAnyLogGroup(
      "logs:DescribeLogGroups",
      options?.caller,
    );

    const page = new SimLogsPage({
      listed: this.#groups.withNamePrefix(input.logGroupNamePrefix),
      limit: input.limit,
      nextToken: input.nextToken,
      maximumLimit: maximumDescribeLimit,
    });

    return {
      $metadata: {},
      logGroups: page.items.map((group) => logGroupDetail(group)),
      nextToken: page.nextToken,
    };
  }
}

/**
 * What DescribeLogGroups reports about one log group.
 *
 * `metricFilterCount` is always zero: metric filters are a CloudWatch metrics
 * feature, and no simulated CloudWatch Logs operation here creates one.
 */
function logGroupDetail(group: SimLogsLogGroup): SimLogsLogGroupDetail {
  return {
    logGroupName: group.logGroupName,
    creationTime: group.creationTime,
    retentionInDays: group.retentionInDays,
    metricFilterCount: 0,
    storedBytes: group.storedBytes,
    arn: group.arn,
    logGroupArn: group.logGroupArn,
  };
}
