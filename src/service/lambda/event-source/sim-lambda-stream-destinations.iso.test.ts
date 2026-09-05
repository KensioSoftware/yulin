import { describe, expect, it } from "vitest";
import { assertNonNullable } from "@kensio/smartass";
import { stream_destination_fixture as setup } from "../../../../test/lambda/stream-destination-fixture.js";

describe("stream batch failure destinations", () => {
  for (const source of ["dynamodb", "kinesis"]) {
    for (const destination of ["sqs", "sns"]) {
      for (const boundary of ["retries", "age"]) {
        it(`delivers ${source} metadata to ${destination} after ${boundary} exhaustion`, async () => {
          // Given a failing stream consumer with a permitted destination.
          const fixture = await setup(source, destination, boundary);
          const { simAws, uuid, streamArn, destinationArn } = fixture;

          // When its record exhausts the configured limit.
          await fixture.write();
          await simAws.backgroundTasksComplete();
          expect(await fixture.receive()).toStrictEqual([]);
          await simAws.clock().advanceBy({ hours: 1 });

          // Then the destination identifies the batch, and mapping reads retain the configuration.
          const records = await fixture.receive();
          expect(records).toHaveLength(1);
          const record = records[0];
          assertNonNullable(record);
          const mapping = await simAws
            .lambda()
            .getEventSourceMapping({ input: { UUID: uuid } });
          const listed = await simAws
            .lambda()
            .listEventSourceMappings({ input: { EventSourceArn: streamArn } });
          expect(mapping.DestinationConfig).toStrictEqual({
            OnFailure: { Destination: destinationArn },
          });
          expect(
            listed.EventSourceMappings[0]?.DestinationConfig,
          ).toStrictEqual(mapping.DestinationConfig);
          expect(record.requestContext).toMatchObject({
            functionArn: mapping.FunctionArn,
            condition:
              boundary === "age"
                ? "RecordAgeExceeded"
                : "RetryAttemptsExhausted",
            approximateInvokeCount: fixture.events.length,
          });
          expect(record.responseContext).toStrictEqual({
            statusCode: 200,
            executedVersion: "$LATEST",
            functionError: "Unhandled",
          });
          expect(record.version).toBe("1.0");
          expect(Number.isNaN(Date.parse(record.timestamp))).toBe(false);
          const info = record.DDBStreamBatchInfo ?? record.KinesisBatchInfo;
          assertNonNullable(info);
          expect(info).toMatchObject({ streamArn, batchSize: 1 });
          expect(info.shardId).toMatch(/^shardId-/u);
          expect(info.startSequenceNumber).toBe(info.endSequenceNumber);
          const firstEvent = fixture.events[0]?.Records[0];
          assertNonNullable(firstEvent);
          const sequenceNumber =
            "dynamodb" in firstEvent
              ? firstEvent.dynamodb.SequenceNumber
              : firstEvent.kinesis.sequenceNumber;
          expect(info.startSequenceNumber).toBe(sequenceNumber);
          expect(record).not.toHaveProperty("requestPayload");
          expect(record).not.toHaveProperty("responsePayload");
          await simAws.clock().advanceBy({ hours: 1 });
          expect(await fixture.receive()).toStrictEqual([]);
        });
      }

      it(`does not notify ${destination} for successful ${source} batches`, async () => {
        // Given a stream consumer that succeeds.
        const fixture = await setup(source, destination, "retries", true, true);
        // When a record is processed and time advances.
        await fixture.write();
        await fixture.simAws.backgroundTasksComplete();
        await fixture.simAws.clock().advanceBy({ hours: 1 });
        // Then there is no failure notification.
        expect(await fixture.receive()).toStrictEqual([]);
      });

      it(`refuses ${source} failure delivery without ${destination} permission`, async () => {
        // Given a consumer whose role can poll but cannot send to the destination.
        const fixture = await setup(source, destination, "retries", false);
        // When the batch exhausts its retries.
        await fixture.write();
        await fixture.simAws.backgroundTasksComplete();
        await expect(
          fixture.simAws.clock().advanceBy({ seconds: 1 }),
        ).rejects.toThrow();
        // Then the failed delivery changed no destination state, and the shard advances.
        expect(await fixture.receive()).toStrictEqual([]);
        await fixture.simAws.clock().advanceBy({ hours: 1 });
        expect(await fixture.receive()).toStrictEqual([]);
      });
    }
  }
});
