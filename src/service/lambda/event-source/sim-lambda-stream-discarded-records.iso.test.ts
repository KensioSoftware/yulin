import { describe, expect, it } from "vitest";
import { assertNonNullable } from "@kensio/smartass";
import { stream_discarded_records_fixture as setup } from "../../../../test/lambda/stream-discarded-records-fixture.js";

describe("records identified by stream failure notifications", () => {
  for (const source of ["dynamodb", "kinesis"]) {
    for (const boundary of ["retries", "age"]) {
      it(`notifies only the failed suffix of a ${source} batch at ${boundary} exhaustion`, async () => {
        // Given a partial-batch consumer that reports the second record as failed.
        const fixture = await setup(source);
        const { simAws, uuid, streamArn, functionName, destinationArn } =
          fixture;
        await simAws
          .lambda()
          .deleteEventSourceMapping({ input: { UUID: uuid } });
        await simAws.lambda().createEventSourceMapping({
          input: {
            EventSourceArn: streamArn,
            FunctionName: functionName,
            StartingPosition: "TRIM_HORIZON",
            FunctionResponseTypes: ["ReportBatchItemFailures"],
            MaximumRetryAttempts: boundary === "retries" ? 0 : -1,
            MaximumRecordAgeInSeconds: 60,
            DestinationConfig: { OnFailure: { Destination: destinationArn } },
          },
        });
        // When three records reach the limit.
        await fixture.write();
        await fixture.write();
        await fixture.write();
        await simAws.backgroundTasksComplete();
        await simAws.clock().advanceBy({ minutes: 2 });
        // Then the successful prefix is absent from the notification.
        const records = await fixture.receive();
        expect(records).toHaveLength(1);
        const info =
          records[0]?.DDBStreamBatchInfo ?? records[0]?.KinesisBatchInfo;
        const lastBatch = fixture.seen.at(-1);
        assertNonNullable(lastBatch);
        expect(info?.startSequenceNumber).toBe(
          lastBatch.at(1) ?? lastBatch.at(0),
        );
        expect(info?.endSequenceNumber).toBe(fixture.seen[0]?.at(-1));
        expect(info?.startSequenceNumber).not.toBe(fixture.seen[0]?.at(0));
        expect(records[0]?.responseContext).not.toHaveProperty("functionError");
      });
    }
  }
});
