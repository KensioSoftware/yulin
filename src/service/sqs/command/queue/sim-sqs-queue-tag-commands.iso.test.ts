import {
  CreateQueueCommand,
  ListQueueTagsCommand,
  SendMessageCommand,
  TagQueueCommand,
  UntagQueueCommand,
} from "@aws-sdk/client-sqs";
import {
  assertInstanceOf,
  assertObjectEquals,
  assertStringEndsWith,
  assertThrowsErrorAsync,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { SimSqsInvalidParameterValue } from "../../error/sim-sqs.error.js";

/**
 * Create a queue tagged for the team given, and answer with its URL.
 */
async function teamQueue(simAws: SimAws, team: string): Promise<string> {
  const created = await simAws
    .sqs()
    .createQueue(new CreateQueueCommand({ QueueName: team, tags: { team } }));

  return created.QueueUrl ?? "";
}

describe("sim SQS queue tags", () => {
  it("holds the tags a queue is created with, and changes them on request", async () => {
    // Given a queue created with two tags
    const simAws = new SimAws();
    const created = await simAws.sqs().createQueue(
      new CreateQueueCommand({
        QueueName: "orders",
        tags: { team: "orders", stage: "test" },
      }),
    );
    const QueueUrl = created.QueueUrl;

    // When one is replaced, one added and one removed
    await simAws
      .sqs()
      .tagQueue(
        new TagQueueCommand({ QueueUrl, Tags: { stage: "prod", cost: "42" } }),
      );
    await simAws
      .sqs()
      .untagQueue(new UntagQueueCommand({ QueueUrl, TagKeys: ["team"] }));
    const listed = await simAws
      .sqs()
      .listQueueTags(new ListQueueTagsCommand({ QueueUrl }));

    // Then the queue holds the result
    assertObjectEquals(listed.Tags, { stage: "prod", cost: "42" });
  });

  it("answers without Tags for a queue holding none", async () => {
    // Given an untagged queue
    const simAws = new SimAws();
    const created = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

    // When its tags are listed
    const listed = await simAws
      .sqs()
      .listQueueTags(new ListQueueTagsCommand({ QueueUrl: created.QueueUrl }));

    // Then there are none
    assertUndefined(listed.Tags);
  });

  it("refuses a tag under the reserved aws: prefix and keeps the tags it had", async () => {
    // Given a tagged queue
    const simAws = new SimAws();
    const QueueUrl = await teamQueue(simAws, "orders");

    // When a reserved key is added beside an ordinary one
    const error = await assertThrowsErrorAsync(async () =>
      simAws.sqs().tagQueue(
        new TagQueueCommand({
          QueueUrl,
          Tags: { stage: "prod", "aws:owner": "me" },
        }),
      ),
    );
    const listed = await simAws
      .sqs()
      .listQueueTags(new ListQueueTagsCommand({ QueueUrl }));

    // Then the request is refused whole
    assertInstanceOf(error, SimSqsInvalidParameterValue);
    assertObjectEquals(listed.Tags, { team: "orders" });
  });

  it("counts a tag's length in characters", async () => {
    // Given a queue
    const simAws = new SimAws();
    const QueueUrl = await teamQueue(simAws, "orders");
    const letter = "\u{10400}";

    // When it is tagged with a key of 128 letters from outside the Basic
    // Multilingual Plane, each two UTF-16 code units, and then one of 129
    await simAws
      .sqs()
      .tagQueue(
        new TagQueueCommand({ QueueUrl, Tags: { [letter.repeat(128)]: "x" } }),
      );
    const error = await assertThrowsErrorAsync(async () =>
      simAws.sqs().tagQueue(
        new TagQueueCommand({
          QueueUrl,
          Tags: { [letter.repeat(129)]: "x" },
        }),
      ),
    );

    // Then only the key over 128 characters is refused
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("needs sqs:TagQueue to create a queue with tags", async () => {
    // Given a caller allowed to create queues and nothing else
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { actions: ["sqs:CreateQueue"] },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it creates one queue without tags, one with an empty tag map,
    // and one with a tag
    const untagged = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "plain" }), {
        caller,
      });
    await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "empty", tags: {} }), {
        caller,
      });
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .sqs()
        .createQueue(
          new CreateQueueCommand({ QueueName: "tagged", tags: { team: "a" } }),
          { caller },
        ),
    );

    // Then only the queue carrying a tag is refused
    assertInstanceOf(error, SimIamAccessDenied);
    assertUndefined(simAws.sqs().findQueue("tagged"));
    assertStringEndsWith(untagged.QueueUrl ?? "", "/plain");
  });

  it("lets a policy decide a request on the queue's tags", async () => {
    // Given two queues tagged for different teams, and a caller allowed to
    // send to those tagged for its own
    const simAws = new SimAws();
    const orders = await teamQueue(simAws, "orders");
    const billing = await teamQueue(simAws, "billing");
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["sqs:SendMessage"],
        condition: { StringEquals: { "aws:ResourceTag/team": "orders" } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it sends to each
    const sent = await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: orders, MessageBody: "hi" }),
        { caller },
      );
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .sqs()
        .sendMessage(
          new SendMessageCommand({ QueueUrl: billing, MessageBody: "hi" }),
          { caller },
        ),
    );

    // Then only its own team's queue takes the message
    assertTypeString(sent.MessageId);
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("gives IAM the tags TagQueue sets and the keys UntagQueue removes", async () => {
    // Given a tagged queue, and a caller allowed to tag and untag only the
    // cost key
    const simAws = new SimAws();
    const QueueUrl = await teamQueue(simAws, "orders");
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["sqs:TagQueue", "sqs:UntagQueue"],
        condition: { "ForAllValues:StringEquals": { "aws:TagKeys": ["cost"] } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it sets and removes the cost key, then tries the team key
    await simAws
      .sqs()
      .tagQueue(new TagQueueCommand({ QueueUrl, Tags: { cost: "42" } }), {
        caller,
      });
    await simAws
      .sqs()
      .untagQueue(new UntagQueueCommand({ QueueUrl, TagKeys: ["cost"] }), {
        caller,
      });
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .sqs()
        .untagQueue(new UntagQueueCommand({ QueueUrl, TagKeys: ["team"] }), {
          caller,
        }),
    );

    // Then only the team key is refused
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
