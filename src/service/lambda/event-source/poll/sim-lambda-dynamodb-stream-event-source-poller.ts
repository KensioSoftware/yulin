import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";
import { simLambdaEventSourceFunction } from "./sim-lambda-event-source-function.js";
import type { SimLambdaDynamoDbStreamEventSourceArn } from "../stream/sim-lambda-dynamodb-stream-event-source-arn.js";
import type { SimLambdaEventSourceStreams } from "../stream/sim-lambda-event-source-streams.js";
import { SimLambdaDynamoDbPolledStream } from "./sim-lambda-dynamodb-polled-stream.js";
import { SimLambdaDynamoDbStreamDelivery } from "./sim-lambda-dynamodb-stream-delivery.js";
import {
  type SimLambdaEventSourcePolls,
  SimLambdaEventSourcePollTurn,
} from "./sim-lambda-event-source-poll-turn.js";
import type { SimLambdaEventSourcePoller } from "./sim-lambda-event-source-poller.js";
import { SimLambdaStreamProgress } from "./sim-lambda-stream-progress.js";

interface SimLambdaDynamoDbStreamEventSourcePollerProperties {
  readonly mapping: SimLambdaEventSourceMapping;
  readonly eventSourceArn: SimLambdaDynamoDbStreamEventSourceArn;
  readonly functions: SimLambdaFunctionLookup;
  readonly streams: SimLambdaEventSourceStreams;
  readonly background: BackgroundScheduler;
}

/**
 * Polls one event source mapping's DynamoDB stream and invokes its function.
 *
 * A sibling of the queue poller rather than a variation on it. Every step
 * differs, and the last one inverts: a queue mapping polls again when a batch
 * came back, because the batch is on the queue waiting; a stream mapping polls
 * again when a batch went through, because the records stay on the stream
 * either way and it is the checkpoint that moved.
 *
 * That is also why nothing else may read while a delivery is in flight. A
 * received message is hidden and a read record is not, so a second poll
 * overlapping the first would hand the same records to the function twice.
 */
export class SimLambdaDynamoDbStreamEventSourcePoller
  implements SimLambdaEventSourcePoller, SimLambdaEventSourcePolls
{
  private readonly mapping: SimLambdaEventSourceMapping;
  private readonly functions: SimLambdaFunctionLookup;
  private readonly stream: SimLambdaDynamoDbPolledStream;
  private readonly delivery: SimLambdaDynamoDbStreamDelivery;
  private readonly progress: SimLambdaStreamProgress;
  private readonly turn = new SimLambdaEventSourcePollTurn(this);

  private stopped = false;

  constructor(properties: SimLambdaDynamoDbStreamEventSourcePollerProperties) {
    const { eventSourceArn, mapping } = properties;

    this.mapping = mapping;
    this.functions = properties.functions;
    this.stream = new SimLambdaDynamoDbPolledStream(
      properties.streams,
      eventSourceArn.value,
    );
    this.delivery = new SimLambdaDynamoDbStreamDelivery({
      mapping,
      eventSourceArn,
    });
    this.progress = new SimLambdaStreamProgress({
      mapping,
      background: properties.background,
      poll: async (): Promise<void> => {
        await this.turn.take();
      },
    });
  }

  /**
   * Watch the stream this mapping polls.
   *
   * Watching starts as soon as the mapping is created, before it has finished
   * creating, so a change made in between is not missed. The poll it wakes
   * finds a mapping that is not polling yet and does nothing, and the poll that
   * follows activation reads from the starting position.
   */
  watch(): void {
    this.stream.watch(this);
  }

  /**
   * Poll as soon as the simulation gets to it, which is what a newly enabled
   * mapping does with whatever its stream already holds, and what a wake-up
   * that arrived mid-poll comes back as.
   */
  pollNow(): void {
    this.progress.pollNow();
  }

  /**
   * Stop polling, as deleting the mapping does.
   */
  stop(): void {
    this.stopped = true;
    this.stream.unwatch(this);
  }

  /**
   * Take a record arriving on the stream as something to poll for.
   *
   * A record written while this mapping's own function is running is the
   * function writing back into its own source table. That never settles, so the
   * mapping stops here and the delivery refuses once it is over.
   */
  recordsAvailable(): void {
    if (this.delivery.noteRecordWritten()) {
      this.stopped = true;

      return;
    }

    this.progress.pollNow();
  }

  /**
   * Read one batch, deliver it, and decide what happens next.
   *
   * Only ever called through the turn, which is what keeps two polls from
   * reading the same records.
   */
  async poll(): Promise<void> {
    const simFunction = this.pollingFunction();

    if (simFunction === undefined) {
      return;
    }

    const { progress } = this;
    // Reading is done as the function's execution role, as on real Lambda, so
    // simulated IAM decides whether this mapping may read its stream.
    const batch = await this.stream.read(
      simFunction.roleArn,
      progress.position,
      this.mapping.batchSize,
    );

    if (batch.records.length === 0) {
      progress.caughtUp(batch);

      return;
    }

    progress.after(await this.delivery.to(simFunction, batch.records), batch);
  }

  /**
   * The function this mapping delivers to, while it should be delivering.
   */
  private pollingFunction(): SimLambdaFunction | undefined {
    if (this.stopped || !this.mapping.isPolling) {
      return undefined;
    }

    return simLambdaEventSourceFunction(this.functions, this.mapping);
  }
}
