import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimLogsStoredEvent } from "../event/sim-logs-event.js";
import type { SimLogsEventIds } from "../event/sim-logs-event-ids.js";
import type { SimLogsLogGroup } from "../group/sim-logs-log-group.js";
import type { SimLogsLogGroupStore } from "../group/sim-logs-log-group-store.js";
import type { SimLogsLogStream } from "../stream/sim-logs-log-stream.js";
import type { SimLogsMetricFanOut } from "../metric/sim-logs-metric-fan-out.js";
import type { SimLogsSubscriptionFanOut } from "../subscription/sim-logs-subscription-fan-out.js";

interface SimLogsServiceWriterProperties {
  readonly groups: SimLogsLogGroupStore;
  readonly eventIds: SimLogsEventIds;
  readonly clock: SimClock;

  /** Where events written here are handed on to subscription filters. */
  readonly fanOut: SimLogsSubscriptionFanOut;

  /** Where events written here are handed on to metric filters. */
  readonly metricFanOut: SimLogsMetricFanOut;
}

/**
 * How the rest of the simulation writes to a log group.
 *
 * This is not the CloudWatch Logs API. A simulated service writing its own
 * logs is the account's own machinery rather than a caller making a request,
 * so nothing here validates a batch, pages, or authorizes: real CloudWatch
 * Logs does not put a Lambda function's own output through PutLogEvents
 * either.
 *
 * Nothing here fails, and that is the point. A group or stream that is not
 * there is made rather than refused, so deleting a log group mid-test does not
 * take the next invocation down with it, which is what real Lambda does when
 * its group has gone.
 */
export class SimLogsServiceWriter {
  readonly #groups: SimLogsLogGroupStore;
  readonly #eventIds: SimLogsEventIds;
  readonly #clock: SimClock;
  readonly #fanOut: SimLogsSubscriptionFanOut;
  readonly #metricFanOut: SimLogsMetricFanOut;

  constructor(properties: SimLogsServiceWriterProperties) {
    this.#groups = properties.groups;
    this.#eventIds = properties.eventIds;
    this.#clock = properties.clock;
    this.#fanOut = properties.fanOut;
    this.#metricFanOut = properties.metricFanOut;
  }

  /**
   * The log group of this name, made if nothing has made it yet.
   *
   * A declared log group and one a service made for itself are the same thing,
   * so this answers with either. Real CloudFormation fails a deploy that
   * declares a group already in the account, which is a genuine
   * misconfiguration there and pure noise in a test whose Lambda function
   * logged during setup.
   */
  logGroup(logGroupName: string): SimLogsLogGroup {
    return this.#groups.ensure(logGroupName, this.#clock.now().getTime());
  }

  /**
   * Remove a log group, and the streams and events it holds with it.
   */
  deleteLogGroup(logGroupName: string): void {
    this.#groups.delete(logGroupName);
  }

  /**
   * Make sure a group and a stream in it both exist, without writing to them.
   *
   * A Lambda execution environment opens its stream as it cold starts, so a
   * function that logged nothing still shows the stream its invocation ran in.
   */
  openStream(logGroupName: string, logStreamName: string): SimLogsLogStream {
    const group = this.logGroup(logGroupName);

    return (
      group.findStream(logStreamName) ??
      group.createStream(logStreamName, this.#clock.now().getTime())
    );
  }

  /**
   * Append lines to a stream, as events timestamped now.
   */
  write(
    logGroupName: string,
    logStreamName: string,
    lines: readonly string[],
  ): void {
    if (lines.length === 0) {
      return;
    }

    const now = this.#clock.now().getTime();
    const stream = this.openStream(logGroupName, logStreamName);
    const events: readonly SimLogsStoredEvent[] = lines.map((message) => ({
      eventId: this.#eventIds.next(),
      timestamp: now,
      ingestionTime: now,
      message,
    }));

    const group = this.logGroup(logGroupName);

    stream.append(events, now);
    this.#fanOut.written(group, logStreamName, events);
    this.#metricFanOut.written(group, events);
  }
}
