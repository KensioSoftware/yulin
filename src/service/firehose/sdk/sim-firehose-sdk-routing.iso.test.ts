import {
  CreateDeliveryStreamCommand,
  DeleteDeliveryStreamCommand,
  DescribeDeliveryStreamCommand,
  FirehoseClient,
  ListDeliveryStreamsCommand,
  PutRecordBatchCommand,
  PutRecordCommand,
} from "@aws-sdk/client-firehose";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deliveredObjectKeys,
  firehoseDeliveryActions,
} from "../../../../test/firehose/firehose-delivery-fixture.js";
import { SimSdk } from "../../../sdk/index.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";

const orderArchive = {
  BucketARN: "arn:aws:s3:::order-archive",
  RoleARN: "arn:aws:iam::888888888888:role/OrderArchiveRole",
  BufferingHints: { IntervalInSeconds: 60 },
};

describe("Firehose SDK interception", () => {
  it("carries a record from an intercepted client into a simulated Bucket", async () => {
    // Given intercepted Firehose and S3 clients, and a Bucket to deliver into.
    using simSdk = new SimSdk();
    simSdk.intercept(FirehoseClient);
    simSdk.intercept(S3Client);

    const firehose = new FirehoseClient({ region: "us-east-1" });
    const s3 = new S3Client({ region: "us-east-1" });

    await s3.send(new CreateBucketCommand({ Bucket: "order-archive" }));

    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "OrderArchiveRole",
        policyName: "ArchiveOrders",
        actions: firehoseDeliveryActions,
        resource: "arn:aws:s3:::order-archive/*",
      },
      simSdk.simAws,
    );

    // When ordinary SDK code creates a delivery stream and puts a record.
    await firehose.send(
      new CreateDeliveryStreamCommand({
        DeliveryStreamName: "order-events",
        ExtendedS3DestinationConfiguration: {
          ...orderArchive,
          RoleARN: role.Arn,
        },
      }),
    );
    await firehose.send(
      new PutRecordCommand({
        DeliveryStreamName: "order-events",
        Record: { Data: new TextEncoder().encode('{"id":"order-1"}\n') },
      }),
    );
    await simSdk.simAws.clock().advanceBy({ minutes: 2 });

    // Then the Object is in the Bucket, with nothing touching the network.
    assertArrayLength(
      await deliveredObjectKeys(simSdk.simAws, "order-archive"),
      1,
    );
  });

  it("routes every delivery stream command an intercepted client sends", async () => {
    // Given an intercepted Firehose client holding one delivery stream.
    using simSdk = new SimSdk();
    simSdk.intercept(FirehoseClient);

    const firehose = new FirehoseClient({ region: "us-east-1" });
    await firehose.send(
      new CreateDeliveryStreamCommand({
        DeliveryStreamName: "order-events",
        ExtendedS3DestinationConfiguration: orderArchive,
      }),
    );

    // When ordinary SDK code lists, describes, puts a batch and deletes.
    const listed = await firehose.send(new ListDeliveryStreamsCommand({}));
    const described = await firehose.send(
      new DescribeDeliveryStreamCommand({
        DeliveryStreamName: "order-events",
      }),
    );
    const batch = await firehose.send(
      new PutRecordBatchCommand({
        DeliveryStreamName: "order-events",
        Records: [{ Data: new Uint8Array([1]) }],
      }),
    );
    await firehose.send(
      new DeleteDeliveryStreamCommand({ DeliveryStreamName: "order-events" }),
    );

    // Then each answered from the simulated delivery stream, and nothing is
    // left to list.
    assertIdentical(listed.DeliveryStreamNames?.[0], "order-events");
    assertIdentical(
      described.DeliveryStreamDescription?.DeliveryStreamStatus,
      "ACTIVE",
    );
    assertIdentical(batch.FailedPutCount, 0);

    const after = await firehose.send(new ListDeliveryStreamsCommand({}));
    assertArrayLength(after.DeliveryStreamNames ?? [], 0);
  });

  it("names the commands it can handle", () => {
    // Given a simulated Firehose.
    using simSdk = new SimSdk();

    // When its SDK router is asked what it handles.
    const supported = simSdk.simAws.firehose().sdkCommandRouter();

    // Then every command this service simulates is named, and one it does not
    // is absent.
    assertArrayLength(supported.supportedCommandNames(), 6);
    assertUndefined(supported.route("UpdateDestinationCommand"));
  });
});
