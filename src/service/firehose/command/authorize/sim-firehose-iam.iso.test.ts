import {
  CreateDeliveryStreamCommand,
  DeleteDeliveryStreamCommand,
  DescribeDeliveryStreamCommand,
  ListDeliveryStreamsCommand,
  PutRecordBatchCommand,
  PutRecordCommand,
} from "@aws-sdk/client-firehose";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { simFirehoseDeliveryStreamFactory } from "../../stream/sim-firehose-delivery-stream.factory.js";

/**
 * A simulated AWS with a Bucket, a delivery stream, and a caller allowed the
 * actions it is given on the resource it is given.
 */
async function simAwsWithCaller(
  actions: readonly string[],
  resource = "*",
): Promise<{ simAws: SimAws; caller: SimAwsCaller }> {
  const simAws = new SimAws();

  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: "order-archive" }));
  await simFirehoseDeliveryStreamFactory.make({}, simAws);

  const role = await simIamRoleWithPolicyFactory.make(
    {
      roleName: "OrderProducerRole",
      policyName: "ProduceOrders",
      actions,
      resource,
    },
    simAws,
  );

  return { simAws, caller: { kind: "arn", arn: role.Arn } };
}

describe("Simulated Firehose IAM authorization", () => {
  it("allows a put by a caller allowed it on that delivery stream", async () => {
    // Given a caller allowed firehose:PutRecord on the delivery stream.
    const { simAws, caller } = await simAwsWithCaller(
      ["firehose:PutRecord"],
      `arn:aws:firehose:us-east-1:${new SimAws().defaultAccountId}:deliverystream/order-events`,
    );

    // When it puts a record.
    const output = await simAws.firehose().putRecord(
      new PutRecordCommand({
        DeliveryStreamName: "order-events",
        Record: { Data: new Uint8Array([1]) },
      }),
      { caller },
    );

    // Then the put was taken.
    assertStringIncludes(output.RecordId, "-");
  });

  it("refuses a put by a caller allowed it on another delivery stream", async () => {
    // Given a caller allowed firehose:PutRecord on a different delivery
    // stream.
    const { simAws, caller } = await simAwsWithCaller(
      ["firehose:PutRecord"],
      "arn:aws:firehose:us-east-1:888888888888:deliverystream/other-events",
    );

    // When it puts a record onto ours.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.firehose().putRecord(
        new PutRecordCommand({
          DeliveryStreamName: "order-events",
          Record: { Data: new Uint8Array([1]) },
        }),
        { caller },
      );
    });

    // Then IAM refuses it, naming the action and the delivery stream.
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, "firehose:PutRecord");
    assertStringIncludes(error.message, "deliverystream/order-events");
  });

  it("refuses a caller before it finds out the delivery stream is missing", async () => {
    // Given a caller allowed nothing.
    const { simAws, caller } = await simAwsWithCaller([]);

    // When it describes a delivery stream that is not there.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.firehose().describeDeliveryStream(
        new DescribeDeliveryStreamCommand({
          DeliveryStreamName: "never-existed",
        }),
        { caller },
      );
    });

    // Then it is refused rather than told the delivery stream is missing,
    // which is the order real IAM works in.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.name, "AccessDenied");
  });

  it("authorizes a listing against every delivery stream", async () => {
    // Given a caller allowed firehose:ListDeliveryStreams on one delivery
    // stream rather than on all of them.
    const { simAws, caller } = await simAwsWithCaller(
      ["firehose:ListDeliveryStreams"],
      "arn:aws:firehose:us-east-1:888888888888:deliverystream/order-events",
    );

    // When it lists.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .firehose()
        .listDeliveryStreams(new ListDeliveryStreamsCommand({}), { caller });
    });

    // Then it is refused. The action names no delivery stream, so a policy
    // scoped to one does not reach it.
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, "firehose:ListDeliveryStreams");
  });

  it("lists for a caller allowed the action on every delivery stream", async () => {
    // Given a caller allowed firehose:ListDeliveryStreams on all of them.
    const { simAws, caller } = await simAwsWithCaller([
      "firehose:ListDeliveryStreams",
    ]);

    // When it lists.
    const listed = await simAws
      .firehose()
      .listDeliveryStreams(new ListDeliveryStreamsCommand({}), { caller });

    // Then the listing is not filtered by what it may reach.
    assertArrayLength(listed.DeliveryStreamNames, 1);
  });

  it("refuses each operation the caller was not allowed", async () => {
    // Given a caller allowed nothing.
    const { simAws, caller } = await simAwsWithCaller([]);
    const firehose = simAws.firehose();

    // When each of the remaining operations is tried.
    const refusals = await Promise.all(
      [
        async (): Promise<unknown> =>
          await firehose.createDeliveryStream(
            new CreateDeliveryStreamCommand({
              DeliveryStreamName: "other-events",
              ExtendedS3DestinationConfiguration: {
                BucketARN: "arn:aws:s3:::order-archive",
                RoleARN: "arn:aws:iam::888888888888:role/Other",
              },
            }),
            { caller },
          ),
        async (): Promise<unknown> =>
          await firehose.deleteDeliveryStream(
            new DeleteDeliveryStreamCommand({
              DeliveryStreamName: "order-events",
            }),
            { caller },
          ),
        async (): Promise<unknown> =>
          await firehose.putRecordBatch(
            new PutRecordBatchCommand({
              DeliveryStreamName: "order-events",
              Records: [{ Data: new Uint8Array([1]) }],
            }),
            { caller },
          ),
      ].map(async (operation) => await assertThrowsErrorAsync(operation)),
    );

    // Then every one of them is refused, naming its own action.
    assertStringIncludes(
      refusals[0]?.message ?? "",
      "firehose:CreateDeliveryStream",
    );
    assertStringIncludes(
      refusals[1]?.message ?? "",
      "firehose:DeleteDeliveryStream",
    );
    assertStringIncludes(refusals[2]?.message ?? "", "firehose:PutRecordBatch");
  });

  it("authorizes a creation against the ARN the delivery stream will have", async () => {
    // Given a caller allowed firehose:CreateDeliveryStream on one name only.
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "order-archive" }));

    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "OrderAdminRole",
        policyName: "AdministerOrders",
        actions: ["firehose:CreateDeliveryStream"],
        resource: `arn:aws:firehose:${simAws.defaultRegionName}:${simAws.defaultAccountId}:deliverystream/order-events`,
      },
      simAws,
    );
    const caller: SimAwsCaller = { kind: "arn", arn: role.Arn };
    const destination = {
      BucketARN: "arn:aws:s3:::order-archive",
      RoleARN: "arn:aws:iam::888888888888:role/OrderArchiveRole",
    };

    // And allowed to hand Firehose the Role the destination names, which is a
    // separate decision from creating the delivery stream.
    await simAws.iam().putRolePolicy({
      input: {
        RoleName: "OrderAdminRole",
        PolicyName: "PassArchiveRole",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "iam:PassRole",
            Resource: destination.RoleARN,
          },
        }),
      },
    });

    // When it creates that one, and then another.
    await simAws.firehose().createDeliveryStream(
      new CreateDeliveryStreamCommand({
        DeliveryStreamName: "order-events",
        ExtendedS3DestinationConfiguration: destination,
      }),
      { caller },
    );

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.firehose().createDeliveryStream(
        new CreateDeliveryStreamCommand({
          DeliveryStreamName: "other-events",
          ExtendedS3DestinationConfiguration: destination,
        }),
        { caller },
      );
    });

    // Then the allowed name was created and the other refused.
    assertStringIncludes(error.message, "deliverystream/other-events");
  });
});
