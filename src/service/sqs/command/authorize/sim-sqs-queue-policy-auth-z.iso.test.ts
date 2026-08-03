import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateQueueCommand,
  SendMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";

const ownerAccountId = "111111111111";
const callerAccountId = "222222222222";
const callerRoleArn = `arn:aws:iam::${callerAccountId}:role/OrderWriter`;
const regionName = "us-east-1";
const queueArn = `arn:aws:sqs:${regionName}:${ownerAccountId}:orders`;
const bucketArn = "arn:aws:s3:::uploads";

const s3ServicePrincipal = {
  kind: "service",
  service: "s3.amazonaws.com",
} as const;

/**
 * A simulated AWS with a queue in the owning Account, carrying the queue policy
 * a test is about.
 */
async function simAwsWithQueuePolicy(policy: string): Promise<{
  simAws: SimAws;
  queueUrl: string;
}> {
  const simAws = new SimAws();
  const simSqs = simAws.account(ownerAccountId).region(regionName).sqs();
  const created = await simSqs.createQueue(
    new CreateQueueCommand({ QueueName: "orders" }),
  );

  await simSqs.setQueueAttributes(
    new SetQueueAttributesCommand({
      QueueUrl: created.QueueUrl,
      Attributes: { Policy: policy },
    }),
  );

  assertNonNullable(created.QueueUrl);

  return { simAws, queueUrl: created.QueueUrl };
}

describe("SQS queue policy authorization", () => {
  it("admits a service principal the queue policy allows", async () => {
    // Given a queue whose policy lets S3 send to it.
    const { simAws, queueUrl } = await simAwsWithQueuePolicy(
      simIamPolicyDocumentFactory.make({
        Statement: {
          Effect: "Allow",
          Principal: { Service: "s3.amazonaws.com" },
          Action: "sqs:SendMessage",
          Resource: queueArn,
        },
      }),
    );

    // When S3 sends to it, as a service principal owning no identity policies
    // anywhere.
    const sent = await simAws
      .account(ownerAccountId)
      .region(regionName)
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
        { caller: s3ServicePrincipal },
      );

    // Then the queue policy is the whole of what admitted it.
    assertNonNullable(sent.MessageId);
  });

  it("refuses a service principal the queue policy does not name", async () => {
    // Given a queue whose policy lets S3 send to it.
    const { simAws, queueUrl } = await simAwsWithQueuePolicy(
      simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { Service: "s3.amazonaws.com" },
          Action: "sqs:SendMessage",
          Resource: queueArn,
        },
      }),
    );

    // When another service sends to it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .account(ownerAccountId)
        .region(regionName)
        .sqs()
        .sendMessage(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: "order-1",
          }),
          { caller: { kind: "service", service: "events.amazonaws.com" } },
        );
    });

    // Then it is denied, since a service principal has nothing else to be
    // allowed by.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("honours an ArnLike aws:SourceArn condition on the statement", async () => {
    // Given a queue admitting S3 only for one Bucket.
    const { simAws, queueUrl } = await simAwsWithQueuePolicy(
      simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { Service: "s3.amazonaws.com" },
          Action: "sqs:SendMessage",
          Resource: queueArn,
          Condition: { ArnLike: { "aws:SourceArn": bucketArn } },
        },
      }),
    );

    // When S3 sends on behalf of that Bucket.
    const sent = await simAws
      .account(ownerAccountId)
      .region(regionName)
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
        { caller: s3ServicePrincipal, sourceArn: bucketArn },
      );

    // Then the condition matched.
    assertNonNullable(sent.MessageId);
  });

  it("refuses a request whose source ARN the condition does not cover", async () => {
    // Given a queue admitting S3 only for one Bucket.
    const { simAws, queueUrl } = await simAwsWithQueuePolicy(
      simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { Service: "s3.amazonaws.com" },
          Action: "sqs:SendMessage",
          Resource: queueArn,
          Condition: { ArnLike: { "aws:SourceArn": bucketArn } },
        },
      }),
    );

    // When S3 sends on behalf of another Bucket.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .account(ownerAccountId)
        .region(regionName)
        .sqs()
        .sendMessage(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: "order-1",
          }),
          { caller: s3ServicePrincipal, sourceArn: "arn:aws:s3:::reports" },
        );
    });

    // Then it is denied, so a grant written for one Bucket does not open
    // another.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("refuses a conditioned request that carries no source ARN", async () => {
    // Given a queue admitting S3 only for one Bucket.
    const { simAws, queueUrl } = await simAwsWithQueuePolicy(
      simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { Service: "s3.amazonaws.com" },
          Action: "sqs:SendMessage",
          Resource: queueArn,
          Condition: { ArnLike: { "aws:SourceArn": bucketArn } },
        },
      }),
    );

    // When S3 sends without saying what it is sending for.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .account(ownerAccountId)
        .region(regionName)
        .sqs()
        .sendMessage(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: "order-1",
          }),
          { caller: s3ServicePrincipal },
        );
    });

    // Then the condition has nothing to match, so the statement does not
    // apply.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("admits another Account's Role when both sides allow it", async () => {
    // Given a queue whose policy grants another Account's Role.
    const { simAws, queueUrl } = await simAwsWithQueuePolicy(
      simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: callerRoleArn },
          Action: "sqs:SendMessage",
          Resource: queueArn,
        },
      }),
    );

    // And that Role's own Account allowing it too.
    const callerIam = simAws.account(callerAccountId).iam();
    await callerIam.createRole(
      new CreateRoleCommand({
        RoleName: "OrderWriter",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${callerAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await callerIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "OrderWriter",
        PolicyName: "SendOrders",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "sqs:SendMessage", Resource: queueArn },
        }),
      }),
    );

    // When that Role sends to the queue.
    const sent = await simAws
      .account(ownerAccountId)
      .region(regionName)
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
        { caller: { kind: "arn", arn: callerRoleArn } },
      );

    // Then it is allowed, which is what a queue policy is for.
    assertNonNullable(sent.MessageId);
  });

  it("refuses another Account's Role its own Account does not allow", async () => {
    // Given a queue whose policy grants another Account's Role.
    const { simAws, queueUrl } = await simAwsWithQueuePolicy(
      simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: callerRoleArn },
          Action: "sqs:SendMessage",
          Resource: queueArn,
        },
      }),
    );

    // And nothing in that Role's own Account allowing it.
    simAws.account(callerAccountId).iam();

    // When that Role sends to the queue.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .account(ownerAccountId)
        .region(regionName)
        .sqs()
        .sendMessage(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: "order-1",
          }),
          { caller: { kind: "arn", arn: callerRoleArn } },
        );
    });

    // Then it is denied: real AWS requires the caller's Account to allow the
    // action as well as the queue policy.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("refuses a caller the queue policy allows on another queue", async () => {
    // Given a queue whose policy admits S3 to a queue that is not this one.
    const { simAws, queueUrl } = await simAwsWithQueuePolicy(
      simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { Service: "s3.amazonaws.com" },
          Action: "sqs:SendMessage",
          Resource: `arn:aws:sqs:${regionName}:${ownerAccountId}:invoices`,
        },
      }),
    );

    // When S3 sends to the queue carrying the policy.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .account(ownerAccountId)
        .region(regionName)
        .sqs()
        .sendMessage(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: "order-1",
          }),
          { caller: s3ServicePrincipal },
        );
    });

    // Then the statement's Resource keeps it from applying.
    assertIdentical(error.name, "AccessDenied");
  });
});
