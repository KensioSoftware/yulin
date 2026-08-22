import { PutRecordCommand } from "@aws-sdk/client-firehose";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
} from "@kensio/smartass";
import { describe, it, vi } from "vitest";

import {
  deliveredObjectKeys,
  makeFirehoseDelivery,
} from "../../../../test/firehose/firehose-delivery-fixture.js";
import { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";
import { simFirehoseDeliveryStreamFactory } from "../stream/sim-firehose-delivery-stream.factory.js";

/**
 * Put one order onto the delivery stream and let the buffering interval pass.
 */
async function putAndDeliver(simAws: SimAws): Promise<void> {
  await simAws.firehose().putRecord(
    new PutRecordCommand({
      DeliveryStreamName: "order-events",
      Record: { Data: new TextEncoder().encode('{"id":"order-1"}\n') },
    }),
  );
  await simAws.clock().advanceBy({ minutes: 2 });
}

describe("The Role a simulated Firehose delivery writes as", () => {
  it("fails the delivery when the Role cannot write to the Bucket", async () => {
    // Given a delivery stream whose Role may read the Bucket and not write to
    // it.
    const simAws = new SimAws();
    const { bucketName, roleArn } = await makeFirehoseDelivery(simAws, {
      actions: ["s3:GetObject", "s3:ListBucket"],
    });

    // When a record is put and the buffering interval passes.
    await putAndDeliver(simAws);

    // Then nothing was written, and the delivery is on the simulator's list of
    // failures with the Role and the key it tried.
    assertArrayLength(await deliveredObjectKeys(simAws, bucketName), 0);

    const failures = simAws.firehose().getDeliveryFailures();
    assertArrayLength(failures, 1);

    const [failure] = failures;
    assertNonNullable(failure, "The delivery failed and was recorded");
    assertIdentical(failure.deliveryStreamName, "order-events");
    assertIdentical(failure.bucketName, bucketName);
    assertIdentical(failure.roleArn, roleArn);
    assertIdentical(failure.recordCount, 1);
    assertInstanceOf(failure.error, SimIamAccessDenied);
    assertTrue(failure.wasRefused);
    assertStringIncludes(failure.reason, "s3:PutObject");
  });

  it("answers the producer either way", async () => {
    // Given a delivery stream whose Role cannot write to the Bucket.
    const simAws = new SimAws();
    await makeFirehoseDelivery(simAws, { actions: ["s3:GetObject"] });

    // When a record is put.
    const output = await simAws.firehose().putRecord(
      new PutRecordCommand({
        DeliveryStreamName: "order-events",
        Record: { Data: new TextEncoder().encode("one\n") },
      }),
    );

    // Then the put was answered with a record id. Real Firehose answers long
    // before it writes the buffer that record joined, and tells the producer
    // nothing about what became of it.
    assertStringIncludes(output.RecordId, "-");

    await simAws.clock().advanceBy({ minutes: 2 });
    assertArrayLength(simAws.firehose().getDeliveryFailures(), 1);
  });

  it("records one failure per buffer that did not land", async () => {
    // Given a delivery stream whose Role cannot write to the Bucket.
    const simAws = new SimAws();
    await makeFirehoseDelivery(simAws, { actions: ["s3:GetObject"] });

    // When two buffering intervals each take a record.
    await putAndDeliver(simAws);
    await putAndDeliver(simAws);

    // Then each buffer failed on its own.
    assertArrayLength(simAws.firehose().getDeliveryFailures(), 2);
  });

  it("delivers as the Role rather than as the caller who put the record", async () => {
    // Given a delivery stream whose Role may write to the Bucket, and a caller
    // who may put records and nothing else.
    const simAws = new SimAws();
    const { bucketName } = await makeFirehoseDelivery(simAws);
    const producer = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "OrderProducerRole",
        policyName: "ProduceOrders",
        actions: ["firehose:PutRecord"],
        resource: "*",
      },
      simAws,
    );

    // When that caller puts a record and the interval passes.
    await simAws.firehose().putRecord(
      new PutRecordCommand({
        DeliveryStreamName: "order-events",
        Record: { Data: new TextEncoder().encode("one\n") },
      }),
      { caller: { kind: "arn", arn: producer.Arn } },
    );
    await simAws.clock().advanceBy({ minutes: 2 });

    // Then the Object landed. The producer has no S3 permission at all, and
    // the delivery is the delivery stream's Role rather than theirs.
    assertArrayLength(await deliveredObjectKeys(simAws, bucketName), 1);
  });

  it("warns about a delivery that failed for anything but a refusal", async () => {
    // Given a delivery stream pointing at a Bucket nothing created.
    const simAws = new SimAws();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await simFirehoseDeliveryStreamFactory.make(
      { bucketName: "never-created" },
      simAws,
    );

    // When two records are put and delivered in separate buffers.
    await putAndDeliver(simAws);
    await putAndDeliver(simAws);

    // Then both failures are recorded, neither is a refusal, and the console
    // was warned once. A Bucket that is not there is a broken simulation
    // rather than a modelled outcome, and a test that never reads the failures
    // should still hear about it.
    const failures = simAws.firehose().getDeliveryFailures();
    assertArrayLength(failures, 2);

    const [failure] = failures;
    assertNonNullable(failure, "The delivery failed and was recorded");
    assertFalse(failure.wasRefused);
    assertArrayLength(warn.mock.calls, 1);

    const [warning] = warn.mock.calls;
    assertNonNullable(warning, "The failed delivery was warned about");
    assertStringIncludes(String(warning[0]), "s3://never-created/");
  });

  it("reports a failure that was not an Error at all", async () => {
    // Given a delivery stream whose destination throws something that is not
    // an Error, which is what a broken collaborator does.
    const simAws = new SimAws();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await simFirehoseDeliveryStreamFactory.make({}, simAws);
    vi.spyOn(simAws.s3(), "putObject").mockRejectedValue("no bucket for you");

    // When a record is put and delivered.
    await putAndDeliver(simAws);

    // Then the failure reads back as the string it was thrown as.
    const failures = simAws.firehose().getDeliveryFailures();
    assertArrayLength(failures, 1);

    const [failure] = failures;
    assertNonNullable(failure, "The delivery failed and was recorded");
    assertIdentical(failure.reason, "no bucket for you");
  });
});
