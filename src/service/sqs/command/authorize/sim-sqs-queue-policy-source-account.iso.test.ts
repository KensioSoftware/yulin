import {
  CreateQueueCommand,
  SendMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";

const ownerAccountId = "111111111111";
const sourceAccountId = "222222222222";
const regionName = "us-east-1";
const queueArn = `arn:aws:sqs:${regionName}:${ownerAccountId}:orders`;
const bucketArn = "arn:aws:s3:::uploads";

const s3ServicePrincipal = {
  kind: "service",
  service: "s3.amazonaws.com",
} as const;

/**
 * The guard AWS documents on a destination queue policy, which only has a job
 * when the queue and the resource sending to it are in different Accounts.
 */
const sourceAccountPolicy = simIamPolicyDocumentFactory.make({
  Statement: {
    Principal: { Service: "s3.amazonaws.com" },
    Action: "sqs:SendMessage",
    Resource: queueArn,
    Condition: { StringEquals: { "aws:SourceAccount": sourceAccountId } },
  },
});

describe("SQS queue policy source Account conditions", () => {
  it("admits a service sending for a resource in the named Account", async () => {
    // Given a queue admitting S3 only for one Account's resources.
    const simAws = new SimAws();
    const simSqs = simAws.account(ownerAccountId).region(regionName).sqs();
    const created = await simSqs.createQueue(
      new CreateQueueCommand({ QueueName: "orders" }),
    );
    await simSqs.setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: created.QueueUrl,
        Attributes: { Policy: sourceAccountPolicy },
      }),
    );

    // When S3 sends on behalf of a Bucket in that Account.
    const sent = await simSqs.sendMessage(
      new SendMessageCommand({
        QueueUrl: created.QueueUrl,
        MessageBody: "order-1",
      }),
      {
        caller: s3ServicePrincipal,
        sourceArn: bucketArn,
        sourceAccount: sourceAccountId,
      },
    );

    // Then the condition matched.
    assertNonNullable(sent.MessageId);
  });

  it("refuses a service sending for a resource in another Account", async () => {
    // Given a queue admitting S3 only for one Account's resources.
    const simAws = new SimAws();
    const simSqs = simAws.account(ownerAccountId).region(regionName).sqs();
    const created = await simSqs.createQueue(
      new CreateQueueCommand({ QueueName: "orders" }),
    );
    await simSqs.setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: created.QueueUrl,
        Attributes: { Policy: sourceAccountPolicy },
      }),
    );

    // When S3 sends on behalf of a Bucket in a third Account.
    const error = await assertThrowsErrorAsync(async () => {
      await simSqs.sendMessage(
        new SendMessageCommand({
          QueueUrl: created.QueueUrl,
          MessageBody: "order-1",
        }),
        {
          caller: s3ServicePrincipal,
          sourceArn: bucketArn,
          sourceAccount: "333333333333",
        },
      );
    });

    // Then it is denied, so a grant written for one Account's Buckets does not
    // admit another's.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("refuses a conditioned request that carries no source Account", async () => {
    // Given a queue admitting S3 only for one Account's resources.
    const simAws = new SimAws();
    const simSqs = simAws.account(ownerAccountId).region(regionName).sqs();
    const created = await simSqs.createQueue(
      new CreateQueueCommand({ QueueName: "orders" }),
    );
    await simSqs.setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: created.QueueUrl,
        Attributes: { Policy: sourceAccountPolicy },
      }),
    );

    // When S3 sends without saying which Account it is sending for.
    const error = await assertThrowsErrorAsync(async () => {
      await simSqs.sendMessage(
        new SendMessageCommand({
          QueueUrl: created.QueueUrl,
          MessageBody: "order-1",
        }),
        { caller: s3ServicePrincipal, sourceArn: bucketArn },
      );
    });

    // Then the condition has nothing to match, so the statement does not
    // apply, which is the safe direction for a key the request left out.
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
