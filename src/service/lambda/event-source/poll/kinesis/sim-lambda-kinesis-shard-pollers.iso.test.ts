import { assertArrayEmpty } from "@kensio/smartass";
import { describe, it } from "vitest";

import { BackgroundTasks } from "../../../../../util/background/background.js";
import type { SimLambdaFunctionLookup } from "../../../function/url/sim-lambda-function-lookup.js";
import type { SimLambdaEventSourceMapping } from "../../sim-lambda-event-source-mapping.js";
import { SimLambdaKinesisEventSourceArn } from "../../stream/kinesis/sim-lambda-kinesis-event-source-arn.js";
import type {
  SimLambdaKinesisStreamBatch,
  SimLambdaKinesisStreams,
} from "../../stream/kinesis/sim-lambda-kinesis-streams.js";
import { SimLambdaKinesisShardPollers } from "./sim-lambda-kinesis-shard-pollers.js";

const eventSourceArn = SimLambdaKinesisEventSourceArn.of(
  "arn:aws:kinesis:eu-west-2:111111111111:stream/orders",
);

/**
 * A mapping that is polling and delivers to a function that is there.
 */
const mapping = {
  isPolling: true,
  functionName: "order-projector",
  batchSize: 10,
  reportsBatchItemFailures: false,
  start: { position: "TRIM_HORIZON" },
} as unknown as SimLambdaEventSourceMapping;

const functions = {
  findTarget: (): unknown => ({
    simFunction: { roleArn: "arn:aws:iam::111111111111:role/Projector" },
  }),
} as unknown as SimLambdaFunctionLookup;

/**
 * Streams whose DescribeStream waits until a test lets it answer.
 *
 * That pause is the whole point: it is the window a mapping can be deleted in,
 * which is what a real DescribeStream call leaves open too.
 */
class PausedStreams implements SimLambdaKinesisStreams {
  readonly described: Promise<void>;

  private release: (() => void) | undefined;
  private answer: (() => void) | undefined;

  constructor() {
    this.described = new Promise<void>((resolve) => {
      this.release = resolve;
    });
  }

  /**
   * Let the DescribeStream call answer.
   */
  answerNow(): void {
    this.answer?.();
  }

  async shardIds(): Promise<readonly string[]> {
    this.release?.();

    await new Promise<void>((resolve) => {
      this.answer = resolve;
    });

    return ["shardId-000000000000"];
  }

  read(): Promise<SimLambdaKinesisStreamBatch> {
    return Promise.reject(new Error("nothing should read after stopping"));
  }

  watch(): void {
    //
  }

  unwatch(): void {
    //
  }
}

describe("the shard pollers of a Kinesis stream mapping", () => {
  it("makes none once it has been stopped mid-discovery", async () => {
    // Given shard pollers part way through finding the shards of their stream.
    const streams = new PausedStreams();
    const shardPollers = new SimLambdaKinesisShardPollers({
      mapping,
      eventSourceArn,
      functions,
      kinesisStreams: streams,
      background: new BackgroundTasks(),
    });

    const polling = shardPollers.polling();
    await streams.described;

    // When the mapping is stopped before that call answers.
    shardPollers.stop();
    streams.answerNow();

    // Then the pollers the call would have made are dropped, so nothing is
    // left polling a mapping that has gone.
    assertArrayEmpty(await polling);
    assertArrayEmpty(shardPollers.made);
  });
});
