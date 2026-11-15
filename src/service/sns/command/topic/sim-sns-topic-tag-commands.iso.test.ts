import {
  CreateTopicCommand,
  ListTagsForResourceCommand,
  PublishCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from "@aws-sdk/client-sns";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import {
  SimSnsAuthorizationErrorException,
  SimSnsInvalidParameterException,
  SimSnsResourceNotFoundException,
  SimSnsTagLimitExceededException,
} from "../../error/sim-sns.error.js";

/**
 * Create a topic tagged for the team given, and answer with its ARN.
 */
async function teamTopic(simAws: SimAws, team: string): Promise<string> {
  const created = await simAws.sns().createTopic(
    new CreateTopicCommand({
      Name: team,
      Tags: [{ Key: "team", Value: team }],
    }),
  );

  return created.TopicArn ?? "";
}

/**
 * The tags a topic holds, as `Key=Value` strings in the order listed.
 */
async function tagsOf(simAws: SimAws, ResourceArn: string): Promise<string[]> {
  const listed = await simAws
    .sns()
    .listTagsForResource(new ListTagsForResourceCommand({ ResourceArn }));

  return listed.Tags.map((tag) => `${tag.Key}=${tag.Value}`);
}

describe("sim SNS topic tags", () => {
  it("holds the tags a topic is created with, and changes them on request", async () => {
    // Given a topic created with two tags
    const simAws = new SimAws();
    const created = await simAws.sns().createTopic(
      new CreateTopicCommand({
        Name: "orders",
        Tags: [
          { Key: "team", Value: "orders" },
          { Key: "stage", Value: "test" },
        ],
      }),
    );
    const ResourceArn = created.TopicArn;

    // When one is replaced, one added and one removed
    await simAws.sns().tagResource(
      new TagResourceCommand({
        ResourceArn,
        Tags: [
          { Key: "stage", Value: "prod" },
          { Key: "cost", Value: "42" },
        ],
      }),
    );
    await simAws
      .sns()
      .untagResource(
        new UntagResourceCommand({ ResourceArn, TagKeys: ["team"] }),
      );

    // Then the topic holds the result
    assertArrayEquals(await tagsOf(simAws, ResourceArn ?? ""), [
      "stage=prod",
      "cost=42",
    ]);
  });

  it("refuses a request that would leave a topic over 50 tags", async () => {
    // Given a topic holding one tag
    const simAws = new SimAws();
    const ResourceArn = await teamTopic(simAws, "orders");

    // When fifty more are added
    const error = await assertThrowsErrorAsync(async () =>
      simAws.sns().tagResource(
        new TagResourceCommand({
          ResourceArn,
          Tags: Array.from({ length: 50 }, (_, index) => ({
            Key: `key-${String(index)}`,
            Value: "value",
          })),
        }),
      ),
    );

    // Then the request is refused whole
    assertInstanceOf(error, SimSnsTagLimitExceededException);
    assertArrayEquals(await tagsOf(simAws, ResourceArn), ["team=orders"]);
  });

  it("answers ResourceNotFound for a topic that is not there", async () => {
    // Given a simulation with no topics
    const simAws = new SimAws();

    // When a topic ARN naming nothing is tagged
    const error = await assertThrowsErrorAsync(async () =>
      simAws.sns().tagResource(
        new TagResourceCommand({
          ResourceArn: `arn:aws:sns:${simAws.defaultRegionName}:${simAws.defaultAccountId}:missing`,
          Tags: [{ Key: "team", Value: "orders" }],
        }),
      ),
    );

    // Then the tag commands' own not-found error answers
    assertInstanceOf(error, SimSnsResourceNotFoundException);
  });

  it("refuses to create a topic again with different tags", async () => {
    // Given a tagged topic
    const simAws = new SimAws();
    const arn = await teamTopic(simAws, "orders");

    // When it is created again with the same tags, with none, and with
    // others
    const same = await simAws.sns().createTopic(
      new CreateTopicCommand({
        Name: "orders",
        Tags: [{ Key: "team", Value: "orders" }],
      }),
    );
    const bare = await simAws
      .sns()
      .createTopic(new CreateTopicCommand({ Name: "orders" }));
    const error = await assertThrowsErrorAsync(async () =>
      simAws.sns().createTopic(
        new CreateTopicCommand({
          Name: "orders",
          Tags: [{ Key: "team", Value: "billing" }],
        }),
      ),
    );

    // Then only the request carrying other tags is refused
    assertIdentical(same.TopicArn, arn);
    assertIdentical(bare.TopicArn, arn);
    assertInstanceOf(error, SimSnsInvalidParameterException);
  });

  it("needs sns:TagResource to create a topic with tags", async () => {
    // Given a caller allowed to create topics and nothing else
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { actions: ["sns:CreateTopic"] },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it creates one topic without tags and one with
    const untagged = await simAws
      .sns()
      .createTopic(new CreateTopicCommand({ Name: "plain" }), { caller });
    const error = await assertThrowsErrorAsync(async () =>
      simAws.sns().createTopic(
        new CreateTopicCommand({
          Name: "tagged",
          Tags: [{ Key: "team", Value: "orders" }],
        }),
        { caller },
      ),
    );

    // Then only the untagged topic is created
    assertTypeString(untagged.TopicArn);
    assertInstanceOf(error, SimSnsAuthorizationErrorException);
    assertUndefined(simAws.sns().findTopic("tagged"));
  });

  it("lets a policy decide a publish on the topic's tags", async () => {
    // Given two topics tagged for different teams, and a caller allowed to
    // publish to those tagged for its own
    const simAws = new SimAws();
    const orders = await teamTopic(simAws, "orders");
    const billing = await teamTopic(simAws, "billing");
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["sns:Publish"],
        condition: { StringEquals: { "aws:ResourceTag/team": "orders" } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it publishes to each
    const published = await simAws
      .sns()
      .publish(new PublishCommand({ TopicArn: orders, Message: "hi" }), {
        caller,
      });
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .sns()
        .publish(new PublishCommand({ TopicArn: billing, Message: "hi" }), {
          caller,
        }),
    );

    // Then only its own team's topic takes the message
    assertTypeString(published.MessageId);
    assertInstanceOf(error, SimSnsAuthorizationErrorException);
  });

  it("gives IAM the keys TagResource and UntagResource name", async () => {
    // Given a tagged topic, and a caller allowed to tag and untag only the
    // cost key
    const simAws = new SimAws();
    const ResourceArn = await teamTopic(simAws, "orders");
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["sns:TagResource", "sns:UntagResource"],
        condition: { "ForAllValues:StringEquals": { "aws:TagKeys": ["cost"] } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it sets and removes the cost key, then tries the team key
    await simAws.sns().tagResource(
      new TagResourceCommand({
        ResourceArn,
        Tags: [{ Key: "cost", Value: "42" }],
      }),
      { caller },
    );
    await simAws
      .sns()
      .untagResource(
        new UntagResourceCommand({ ResourceArn, TagKeys: ["cost"] }),
        { caller },
      );
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .sns()
        .untagResource(
          new UntagResourceCommand({ ResourceArn, TagKeys: ["team"] }),
          { caller },
        ),
    );

    // Then only the team key is refused
    assertInstanceOf(error, SimSnsAuthorizationErrorException);
  });
});
