import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimLogsLogStream } from "../stream/sim-logs-log-stream.js";
import { SimLogsLogStreamStore } from "../stream/sim-logs-log-stream-store.js";
import {
  simLogsLogGroupArn,
  simLogsLogGroupWildcardArn,
  simLogsLogStreamArn,
} from "./sim-logs-arn.js";

interface SimLogsLogGroupProperties {
  readonly logGroupName: string;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly creationTime: number;
}

/**
 * One log group in a simulated CloudWatch Logs, and the streams it holds.
 *
 * A group carries two ARNs because real CloudWatch Logs reports two. The one
 * ending in `:*` is what `DescribeLogGroups` has always returned as `arn` and
 * what a policy is written against; `logGroupArn` is the later field that names
 * the group alone.
 */
export class SimLogsLogGroup {
  readonly logGroupName: string;
  readonly logGroupArn: string;
  readonly arn: string;
  readonly creationTime: number;

  readonly #streams: SimLogsLogStreamStore;
  #retentionInDays: number | undefined;

  constructor(properties: SimLogsLogGroupProperties) {
    const { logGroupName, accountRegionScope } = properties;

    this.logGroupName = logGroupName;
    this.creationTime = properties.creationTime;
    this.logGroupArn = simLogsLogGroupArn(accountRegionScope, logGroupName);
    this.arn = simLogsLogGroupWildcardArn(accountRegionScope, logGroupName);
    this.#streams = new SimLogsLogStreamStore({
      arnOf: (logStreamName): string =>
        simLogsLogStreamArn(accountRegionScope, logGroupName, logStreamName),
    });
  }

  /**
   * How long events in this group are kept, or undefined where nothing has set
   * it and they are kept forever.
   */
  get retentionInDays(): number | undefined {
    return this.#retentionInDays;
  }

  /**
   * Every stream in this group, in creation order.
   */
  get streams(): readonly SimLogsLogStream[] {
    return this.#streams.all;
  }

  /**
   * How many bytes of log data this group holds across its streams.
   */
  get storedBytes(): number {
    return this.streams.reduce(
      (total, stream) => total + stream.storedBytes,
      0,
    );
  }

  /**
   * Set how long events in this group are kept.
   */
  setRetention(retentionInDays: number | undefined): void {
    this.#retentionInDays = retentionInDays;
  }

  /**
   * Make a stream in this group.
   */
  createStream(logStreamName: string, creationTime: number): SimLogsLogStream {
    return this.#streams.create(logStreamName, creationTime);
  }

  /**
   * Find a stream in this group by name.
   */
  findStream(logStreamName: string): SimLogsLogStream | undefined {
    return this.#streams.find(logStreamName);
  }

  /**
   * Get a stream in this group, refusing one that is not there.
   */
  requireStream(logStreamName: string): SimLogsLogStream {
    return this.#streams.require(logStreamName);
  }
}
