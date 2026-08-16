import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  SimLogsResourceAlreadyExistsException,
  SimLogsResourceNotFoundException,
} from "../error/sim-logs.error.js";
import { SimLogsLogStream } from "../stream/sim-logs-log-stream.js";
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

  readonly #accountRegionScope: SimAwsAccountRegionScope;
  readonly #streams = new Map<string, SimLogsLogStream>();
  #retentionInDays: number | undefined;

  constructor(properties: SimLogsLogGroupProperties) {
    const { logGroupName, accountRegionScope } = properties;

    this.logGroupName = logGroupName;
    this.#accountRegionScope = accountRegionScope;
    this.creationTime = properties.creationTime;
    this.logGroupArn = simLogsLogGroupArn(accountRegionScope, logGroupName);
    this.arn = simLogsLogGroupWildcardArn(accountRegionScope, logGroupName);
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
    return this.#streams.values().toArray();
  }

  /**
   * How many bytes of log data this group holds across its streams.
   */
  get storedBytes(): number {
    return this.streams.reduce((total, stream) => total + stream.storedBytes, 0);
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
    if (this.#streams.has(logStreamName)) {
      throw new SimLogsResourceAlreadyExistsException(
        "The specified log stream already exists",
      );
    }

    const stream = new SimLogsLogStream({
      logStreamName,
      arn: simLogsLogStreamArn(
        this.#accountRegionScope,
        this.logGroupName,
        logStreamName,
      ),
      creationTime,
    });

    this.#streams.set(logStreamName, stream);

    return stream;
  }

  /**
   * Find a stream in this group by name.
   */
  findStream(logStreamName: string): SimLogsLogStream | undefined {
    return this.#streams.get(logStreamName);
  }

  /**
   * Get a stream in this group, refusing one that is not there.
   *
   * Real CloudWatch Logs does not create a stream on a write, so putting
   * events to a name nothing created fails here the way it fails in an
   * account.
   */
  requireStream(logStreamName: string): SimLogsLogStream {
    const stream = this.findStream(logStreamName);

    if (stream === undefined) {
      throw new SimLogsResourceNotFoundException(
        "The specified log stream does not exist.",
      );
    }

    return stream;
  }
}
