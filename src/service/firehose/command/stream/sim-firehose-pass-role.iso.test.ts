import { CreateDeliveryStreamCommand } from "@aws-sdk/client-firehose";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";

const deliveryRoleArn = "arn:aws:iam::888888888888:role/OrderArchiveRole";

const destination = {
  BucketARN: "arn:aws:s3:::order-archive",
  RoleARN: deliveryRoleArn,
};

/**
 * A simulation holding the destination Bucket, and a Role allowed to create
 * delivery streams and nothing else.
 */
async function simulationWithCreator(): Promise<{
  simAws: SimAws;
  creatorArn: string;
}> {
  const simAws = new SimAws();

  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: "order-archive" }));

  const creator = await simIamRoleWithPolicyFactory.make(
    {
      roleName: "Creator",
      policyName: "CreateDeliveryStreams",
      actions: ["firehose:CreateDeliveryStream"],
    },
    simAws,
  );

  return { simAws, creatorArn: creator.Arn };
}

describe("passing a delivery role to Firehose CreateDeliveryStream", () => {
  it("refuses a caller that may create and may not pass the role", async () => {
    // Given a Role allowed to create delivery streams and nothing else.
    const { simAws, creatorArn } = await simulationWithCreator();

    // When it creates one naming the Role Firehose delivers as.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.firehose().createDeliveryStream(
        new CreateDeliveryStreamCommand({
          DeliveryStreamName: "order-events",
          ExtendedS3DestinationConfiguration: destination,
        }),
        { caller: { kind: "arn", arn: creatorArn } },
      ),
    );

    // Then the refusal is about the Role rather than the delivery stream.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "iam:PassRole");
    assertIdentical(error.resource, deliveryRoleArn);
    assertStringIncludes(error.message, creatorArn);
    assertUndefined(simAws.firehose().findDeliveryStream("order-events"));
  });

  it("creates for a caller allowed to pass a role to Firehose", async () => {
    // Given the same Role, also allowed to pass a role to firehose.
    const { simAws, creatorArn } = await simulationWithCreator();

    await simAws.iam().putRolePolicy({
      input: {
        RoleName: "Creator",
        PolicyName: "PassDeliveryRole",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "iam:PassRole",
            Resource: deliveryRoleArn,
            Condition: {
              StringEquals: { "iam:PassedToService": "firehose.amazonaws.com" },
            },
          },
        }),
      },
    });

    // When it creates the delivery stream.
    const created = await simAws.firehose().createDeliveryStream(
      new CreateDeliveryStreamCommand({
        DeliveryStreamName: "order-events",
        ExtendedS3DestinationConfiguration: destination,
      }),
      { caller: { kind: "arn", arn: creatorArn } },
    );

    // Then the condition matched and the delivery stream is there.
    assertStringIncludes(created.DeliveryStreamARN, "order-events");
  });
});
