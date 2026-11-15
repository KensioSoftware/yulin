import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  ListTagsForResourceCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  assertInstanceOf,
  assertNonNullable,
  assertObjectEquals,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import {
  SimLogsInvalidParameterException,
  SimLogsResourceNotFoundException,
  SimLogsTooManyTagsException,
} from "../../error/sim-logs.error.js";

/**
 * Create a log group tagged for the team given, and answer with its ARN.
 */
async function teamGroup(simAws: SimAws, team: string): Promise<string> {
  await simAws.logs().createLogGroup(
    new CreateLogGroupCommand({
      logGroupName: `/${team}/app`,
      tags: { team },
    }),
  );

  const group = simAws.logs().findLogGroup(`/${team}/app`);
  assertNonNullable(group);

  return group.logGroupArn;
}

describe("sim CloudWatch Logs log group tags", () => {
  it("holds the tags a log group is created with, and changes them on request", async () => {
    // Given a log group created with two tags
    const simAws = new SimAws();
    await simAws.logs().createLogGroup(
      new CreateLogGroupCommand({
        logGroupName: "/orders/app",
        tags: { team: "orders", stage: "test" },
      }),
    );
    const resourceArn = simAws.logs().findLogGroup("/orders/app")?.arn;

    // When one is replaced, one added and one removed, naming the group by
    // the ARN with the trailing wildcard
    await simAws.logs().tagResource(
      new TagResourceCommand({
        resourceArn,
        tags: { stage: "prod", cost: "42" },
      }),
    );
    await simAws
      .logs()
      .untagResource(
        new UntagResourceCommand({ resourceArn, tagKeys: ["team"] }),
      );
    const listed = await simAws
      .logs()
      .listTagsForResource(new ListTagsForResourceCommand({ resourceArn }));

    // Then the group holds the result
    assertObjectEquals(listed.tags, { stage: "prod", cost: "42" });
  });

  it("refuses a request that would leave a log group over 50 tags", async () => {
    // Given a log group holding one tag
    const simAws = new SimAws();
    const resourceArn = await teamGroup(simAws, "orders");

    // When fifty more are added
    const tags = Object.fromEntries(
      Array.from({ length: 50 }, (_, index) => [`key-${String(index)}`, "v"]),
    );
    const error = await assertThrowsErrorAsync(async () =>
      simAws.logs().tagResource(
        new TagResourceCommand({
          resourceArn,
          tags,
        }),
      ),
    );

    // Then the request is refused whole
    assertInstanceOf(error, SimLogsTooManyTagsException);
    assertObjectEquals(
      simAws.logs().findLogGroup("/orders/app")?.tags.record() ?? {},
      { team: "orders" },
    );
  });

  it("answers ResourceNotFound for a missing group and refuses other ARNs", async () => {
    // Given a simulation with no log groups
    const simAws = new SimAws();
    const prefix = `arn:aws:logs:${simAws.defaultRegionName}:${simAws.defaultAccountId}`;

    // When a missing group and a delivery source are tagged
    const missing = await assertThrowsErrorAsync(async () =>
      simAws.logs().tagResource(
        new TagResourceCommand({
          resourceArn: `${prefix}:log-group:/missing`,
          tags: { team: "orders" },
        }),
      ),
    );
    const delivery = await assertThrowsErrorAsync(async () =>
      simAws.logs().tagResource(
        new TagResourceCommand({
          resourceArn: `${prefix}:delivery-source:site`,
          tags: { team: "orders" },
        }),
      ),
    );

    // Then each is refused
    assertInstanceOf(missing, SimLogsResourceNotFoundException);
    assertInstanceOf(delivery, SimLogsInvalidParameterException);
  });

  it("needs logs:TagResource or logs:TagLogGroup to create a log group with tags", async () => {
    // Given a caller allowed to create log groups only, and one also allowed
    // the older logs:TagLogGroup
    const simAws = new SimAws();
    const createOnly = await simIamRoleWithPolicyFactory.make(
      { roleName: "CreateOnly", actions: ["logs:CreateLogGroup"] },
      simAws,
    );
    const olderTagging = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "OlderTagging",
        actions: ["logs:CreateLogGroup", "logs:TagLogGroup"],
      },
      simAws,
    );
    const create = async (
      arn: string,
      logGroupName: string,
    ): Promise<unknown> =>
      simAws
        .logs()
        .createLogGroup(
          new CreateLogGroupCommand({ logGroupName, tags: { team: "orders" } }),
          { caller: { kind: "arn", arn } },
        );

    // When each creates a tagged log group
    const error = await assertThrowsErrorAsync(async () =>
      create(createOnly.Arn, "/refused"),
    );
    await create(olderTagging.Arn, "/allowed");

    // Then only the caller allowed to tag makes one
    assertInstanceOf(error, SimIamAccessDenied);
    assertUndefined(simAws.logs().findLogGroup("/refused"));
    assertNonNullable(simAws.logs().findLogGroup("/allowed"));
  });

  it("lets a policy decide a request on a log stream by its group's tags", async () => {
    // Given two log groups tagged for different teams, and a caller allowed
    // to create streams in those tagged for its own
    const simAws = new SimAws();
    await teamGroup(simAws, "orders");
    await teamGroup(simAws, "billing");
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["logs:CreateLogStream"],
        condition: { StringEquals: { "aws:ResourceTag/team": "orders" } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it creates a stream in each
    await simAws.logs().createLogStream(
      new CreateLogStreamCommand({
        logGroupName: "/orders/app",
        logStreamName: "one",
      }),
      { caller },
    );
    const error = await assertThrowsErrorAsync(async () =>
      simAws.logs().createLogStream(
        new CreateLogStreamCommand({
          logGroupName: "/billing/app",
          logStreamName: "one",
        }),
        { caller },
      ),
    );

    // Then only its own team's group takes the stream
    assertNonNullable(
      simAws.logs().findLogGroup("/orders/app")?.findStream("one"),
    );
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("gives IAM the keys TagResource and UntagResource name", async () => {
    // Given a tagged log group, and a caller allowed to tag and untag only
    // the cost key
    const simAws = new SimAws();
    const resourceArn = await teamGroup(simAws, "orders");
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["logs:TagResource", "logs:UntagResource"],
        condition: { "ForAllValues:StringEquals": { "aws:TagKeys": ["cost"] } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it sets and removes the cost key, then tries the team key
    await simAws
      .logs()
      .tagResource(
        new TagResourceCommand({ resourceArn, tags: { cost: "42" } }),
        { caller },
      );
    await simAws
      .logs()
      .untagResource(
        new UntagResourceCommand({ resourceArn, tagKeys: ["cost"] }),
        { caller },
      );
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .logs()
        .untagResource(
          new UntagResourceCommand({ resourceArn, tagKeys: ["team"] }),
          { caller },
        ),
    );

    // Then only the team key is refused
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
