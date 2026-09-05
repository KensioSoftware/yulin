import { describe, expect, it } from "vitest";
import { stream_discarded_records_fixture as setup } from "../../../../test/lambda/stream-discarded-records-fixture.js";

describe("stream expiry notifications", () => {
  for (const source of ["dynamodb", "kinesis"]) {
    it(`discards only the expired prefix of a ${source} batch`, async () => {
      // Given a failing consumer and two records written thirty seconds apart.
      const fixture = await setup(source, false);
      await fixture.write();
      await fixture.simAws.backgroundTasksComplete();
      await fixture.simAws.clock().advanceBy({ seconds: 30 });
      await fixture.write();
      await fixture.simAws.backgroundTasksComplete();
      // When only the first record has expired.
      await fixture.simAws.clock().advanceBy({ seconds: 34 });
      // Then its notification excludes the younger record, which was invoked again.
      const records = await fixture.receive();
      expect(records).toHaveLength(1);
      const info =
        records[0]?.DDBStreamBatchInfo ?? records[0]?.KinesisBatchInfo;
      expect(info?.batchSize).toBe(1);
      expect(info?.startSequenceNumber).toBe(fixture.seen[0]?.[0]);
      expect(fixture.seen.at(-1)).not.toContain(info?.startSequenceNumber);
    });

    it(`notifies for ${source} records already expired before the first poll`, async () => {
      // Given an unmapped stream holding an expired record.
      const fixture = await setup(source);
      const { simAws, uuid, streamArn, functionName, destinationArn } = fixture;
      await simAws.lambda().deleteEventSourceMapping({ input: { UUID: uuid } });
      await fixture.write();
      await simAws.backgroundTasksComplete();
      await simAws.clock().advanceBy({ seconds: 61 });
      // When a new mapping reads from the start with a one-minute record age.
      await simAws.lambda().createEventSourceMapping({
        input: {
          EventSourceArn: streamArn,
          FunctionName: functionName,
          StartingPosition: "TRIM_HORIZON",
          MaximumRecordAgeInSeconds: 60,
          DestinationConfig: { OnFailure: { Destination: destinationArn } },
        },
      });
      await simAws.backgroundTasksComplete();
      // Then the notification reports zero invocations and the handler never saw the record.
      const records = await fixture.receive();
      expect(records).toHaveLength(1);
      expect(records[0]?.requestContext).toMatchObject({
        condition: "RecordAgeExceeded",
        approximateInvokeCount: 0,
      });
      expect(fixture.seen).toStrictEqual([]);
    });
  }
});
