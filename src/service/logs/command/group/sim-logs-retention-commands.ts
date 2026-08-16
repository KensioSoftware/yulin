import { requiredSimLogsLogGroupName } from "../../group/sim-logs-log-group-name.js";
import type { SimLogsLogGroupStore } from "../../group/sim-logs-log-group-store.js";
import { requiredSimLogsRetentionDays } from "../../group/sim-logs-retention.js";
import type { SimLogsAuthorizer } from "../authorize/sim-logs-authorizer.js";
import type { SimLogsRequestOptions } from "../sim-logs-request-options.js";
import type {
  SimDeleteRetentionPolicyCommand,
  SimDeleteRetentionPolicyCommandOutput,
  SimPutRetentionPolicyCommand,
  SimPutRetentionPolicyCommandOutput,
} from "./group.command.js";

interface SimLogsRetentionCommandsProperties {
  readonly groups: SimLogsLogGroupStore;
  readonly authorizer: SimLogsAuthorizer;
}

/**
 * The commands that set and clear how long a log group keeps its events.
 *
 * Nothing here expires anything. Retention is held so a test can assert on
 * what a stack set, which is the mistake worth catching: a group deployed with
 * the wrong retention, or with none at all, costs money quietly for years.
 * Simulating the expiry itself would need a test to move the clock by months
 * to see any effect.
 */
export class SimLogsRetentionCommands {
  readonly #groups: SimLogsLogGroupStore;
  readonly #authorizer: SimLogsAuthorizer;

  constructor(properties: SimLogsRetentionCommandsProperties) {
    this.#groups = properties.groups;
    this.#authorizer = properties.authorizer;
  }

  /**
   * Set how long a log group keeps its events.
   */
  putRetentionPolicy(
    command: SimPutRetentionPolicyCommand,
    options?: SimLogsRequestOptions,
  ): SimPutRetentionPolicyCommandOutput {
    const logGroupName = requiredSimLogsLogGroupName(command.input.logGroupName);
    const retentionInDays = requiredSimLogsRetentionDays(
      command.input.retentionInDays,
    );

    this.#authorizer.authorizeLogGroup(
      "logs:PutRetentionPolicy",
      logGroupName,
      options?.caller,
    );

    this.#groups.require(logGroupName).setRetention(retentionInDays);

    return { $metadata: {} };
  }

  /**
   * Clear a log group's retention, putting it back to keeping events forever.
   */
  deleteRetentionPolicy(
    command: SimDeleteRetentionPolicyCommand,
    options?: SimLogsRequestOptions,
  ): SimDeleteRetentionPolicyCommandOutput {
    const logGroupName = requiredSimLogsLogGroupName(command.input.logGroupName);

    this.#authorizer.authorizeLogGroup(
      "logs:DeleteRetentionPolicy",
      logGroupName,
      options?.caller,
    );

    this.#groups.require(logGroupName).setRetention(undefined);

    return { $metadata: {} };
  }
}
