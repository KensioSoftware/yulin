import {
  DeleteStreamCommand,
  ListStreamsCommand,
} from "@aws-sdk/client-kinesis";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simKinesisStreamFactory } from "../../stream/sim-kinesis-stream.factory.js";

describe("Paging a simulated Kinesis stream listing", () => {
  it("pages a listing longer than the limit it was given", async () => {
    // Given three streams.
    const simAws = new SimAws();
    for (const streamName of ["alpha", "beta", "gamma"]) {
      // oxlint-disable-next-line no-await-in-loop
      await simKinesisStreamFactory.make({ streamName }, simAws);
    }

    // When they are listed two at a time.
    const first = await simAws
      .kinesis()
      .listStreams(new ListStreamsCommand({ Limit: 2 }));
    const second = await simAws
      .kinesis()
      .listStreams(new ListStreamsCommand({ NextToken: first.NextToken }));

    // Then the pages follow each other in name order, and the last one says so.
    assertTrue(first.HasMoreStreams);
    assertIdentical(first.StreamNames.join(","), "alpha,beta");
    assertIdentical(second.StreamNames.join(","), "gamma");
    assertFalse(second.HasMoreStreams);
  });

  it("carries on in name order from a continuation key nothing holds", async () => {
    // Given three streams, and a token naming one that has since been deleted.
    const simAws = new SimAws();
    for (const streamName of ["alpha", "beta", "gamma"]) {
      // oxlint-disable-next-line no-await-in-loop
      await simKinesisStreamFactory.make({ streamName }, simAws);
    }
    await simAws
      .kinesis()
      .deleteStream(new DeleteStreamCommand({ StreamName: "beta" }));

    // When the listing carries on from that name.
    const listed = await simAws
      .kinesis()
      .listStreams(new ListStreamsCommand({ NextToken: "beta" }));

    // Then it picks up where that name belongs in the order, rather than
    // starting again from the first page and looping forever.
    assertIdentical(listed.StreamNames.join(","), "gamma");
  });

  it("gives an empty last page for a continuation key past the end", async () => {
    // Given one stream.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When the listing carries on from a name after every stream it holds.
    const listed = await simAws
      .kinesis()
      .listStreams(new ListStreamsCommand({ NextToken: "zzz" }));

    // Then the page is empty and says there is no more.
    assertArrayLength(listed.StreamNames, 0);
    assertFalse(listed.HasMoreStreams);
  });
});
