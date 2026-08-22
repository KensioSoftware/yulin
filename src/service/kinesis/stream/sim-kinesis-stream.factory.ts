import { AsyncMappedFactory } from "@kensio/part-factory";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimKinesisStream } from "./sim-kinesis-stream.js";

/**
 * What a test asks for when it wants a stream to put records onto.
 */
export interface SimKinesisStreamInput {
  readonly streamName: string;
  readonly shardCount: number;
}

/**
 * Creates a Kinesis data stream through CreateStream.
 *
 * The stream went through the ordinary command, so it is the stream an
 * application would have rather than one built around the commands, and it is
 * ACTIVE by the time this answers.
 *
 * ```typescript
 * const stream = await simKinesisStreamFactory.make(
 *   { streamName: "orders", shardCount: 2 },
 *   simAws,
 * );
 * ```
 */
export const simKinesisStreamFactory = new AsyncMappedFactory<
  SimKinesisStreamInput,
  SimKinesisStream,
  SimAws
>(
  () => ({ streamName: "orders", shardCount: 1 }),
  async (input, simAws) => {
    const kinesis = simAws.kinesis();

    await kinesis.createStream({
      input: { StreamName: input.streamName, ShardCount: input.shardCount },
    });

    // A name CreateStream accepted is a stream the store holds, so this is only
    // missing if something is wrong with the simulator itself.
    const stream = kinesis.findStream(input.streamName);
    assertDefined(
      stream,
      `Simulated Kinesis created the stream ${input.streamName} and then did ` +
        `not hold it`,
    );

    return stream;
  },
);
