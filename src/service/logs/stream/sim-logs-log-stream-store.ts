import {
  SimLogsResourceAlreadyExistsException,
  SimLogsResourceNotFoundException,
} from "../error/sim-logs.error.js";
import { SimLogsLogStream } from "./sim-logs-log-stream.js";

interface SimLogsLogStreamStoreProperties {
  /** How a stream in this group is named in an ARN. */
  readonly arnOf: (logStreamName: string) => string;
}

/**
 * The streams of one log group.
 *
 * A stream has no identity outside the group holding it: two groups may hold
 * streams of the same name, and deleting a group takes its streams with it.
 * That is why this belongs to the group rather than to the service.
 */
export class SimLogsLogStreamStore {
  readonly #arnOf: (logStreamName: string) => string;
  readonly #streams = new Map<string, SimLogsLogStream>();

  constructor(properties: SimLogsLogStreamStoreProperties) {
    this.#arnOf = properties.arnOf;
  }

  /**
   * Every stream in this group, in creation order.
   */
  get all(): readonly SimLogsLogStream[] {
    return this.#streams.values().toArray();
  }

  /**
   * Make a stream, refusing a name that is taken.
   */
  create(logStreamName: string, creationTime: number): SimLogsLogStream {
    if (this.#streams.has(logStreamName)) {
      throw new SimLogsResourceAlreadyExistsException(
        "The specified log stream already exists",
      );
    }

    const stream = new SimLogsLogStream({
      logStreamName,
      arn: this.#arnOf(logStreamName),
      creationTime,
    });

    this.#streams.set(logStreamName, stream);

    return stream;
  }

  /**
   * Find a stream by name.
   */
  find(logStreamName: string): SimLogsLogStream | undefined {
    return this.#streams.get(logStreamName);
  }

  /**
   * Get a stream by name, refusing one that is not there.
   *
   * Real CloudWatch Logs does not create a stream on a write, so putting
   * events to a name nothing created fails here the way it fails in an
   * account.
   */
  require(logStreamName: string): SimLogsLogStream {
    const stream = this.find(logStreamName);

    if (stream === undefined) {
      throw new SimLogsResourceNotFoundException(
        "The specified log stream does not exist.",
      );
    }

    return stream;
  }
}
