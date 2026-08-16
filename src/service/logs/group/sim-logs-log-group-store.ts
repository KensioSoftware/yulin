import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  SimLogsResourceAlreadyExistsException,
  SimLogsResourceNotFoundException,
} from "../error/sim-logs.error.js";
import { SimLogsLogGroup } from "./sim-logs-log-group.js";

interface SimLogsLogGroupStoreProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The log groups of one simulated CloudWatch Logs scope.
 *
 * Groups are keyed by name, which is the whole of their identity: the name is
 * unique within one account and region, and it is what the ARN carries.
 */
export class SimLogsLogGroupStore {
  readonly #accountRegionScope: SimAwsAccountRegionScope;
  readonly #groups = new Map<string, SimLogsLogGroup>();

  constructor(properties: SimLogsLogGroupStoreProperties) {
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Every log group in this scope, in creation order.
   */
  get all(): readonly SimLogsLogGroup[] {
    return this.#groups.values().toArray();
  }

  /**
   * Make a log group, refusing a name that is taken.
   */
  create(logGroupName: string, creationTime: number): SimLogsLogGroup {
    if (this.#groups.has(logGroupName)) {
      throw new SimLogsResourceAlreadyExistsException(
        "The specified log group already exists",
      );
    }

    const group = new SimLogsLogGroup({
      logGroupName,
      accountRegionScope: this.#accountRegionScope,
      creationTime,
    });

    this.#groups.set(logGroupName, group);

    return group;
  }

  /**
   * Find a log group by name.
   */
  find(logGroupName: string): SimLogsLogGroup | undefined {
    return this.#groups.get(logGroupName);
  }

  /**
   * Get a log group by name, refusing one that is not there.
   */
  require(logGroupName: string): SimLogsLogGroup {
    const group = this.find(logGroupName);

    if (group === undefined) {
      throw new SimLogsResourceNotFoundException(
        "The specified log group does not exist.",
      );
    }

    return group;
  }

  /**
   * The log groups whose names start with a prefix, in creation order.
   */
  withNamePrefix(prefix: string | undefined): readonly SimLogsLogGroup[] {
    return this.all.filter((group) =>
      group.logGroupName.startsWith(prefix ?? ""),
    );
  }

  /**
   * Remove a log group, and the streams and events it holds with it.
   */
  delete(logGroupName: string): void {
    this.#groups.delete(logGroupName);
  }
}
