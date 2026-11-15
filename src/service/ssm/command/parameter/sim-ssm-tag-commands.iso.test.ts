import {
  AddTagsToResourceCommand,
  GetParameterCommand,
  ListTagsForResourceCommand,
  PutParameterCommand,
  RemoveTagsFromResourceCommand,
} from "@aws-sdk/client-ssm";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import {
  SimSsmInvalidResourceId,
  SimSsmInvalidResourceType,
  SimSsmTooManyTagsError,
  SimSsmValidationException,
} from "../../error/sim-ssm.error.js";

/**
 * Create a parameter tagged for the team given.
 */
async function teamParameter(simAws: SimAws, team: string): Promise<void> {
  await simAws.ssm().putParameter(
    new PutParameterCommand({
      Name: `/${team}/db-host`,
      Type: "String",
      Value: "db.internal",
      Tags: [{ Key: "team", Value: team }],
    }),
  );
}

/**
 * The tags a parameter holds, as `Key=Value` strings in the order listed.
 */
async function tagsOf(simAws: SimAws, ResourceId: string): Promise<string[]> {
  const listed = await simAws
    .ssm()
    .listTagsForResource(
      new ListTagsForResourceCommand({ ResourceType: "Parameter", ResourceId }),
    );

  return listed.TagList.map((tag) => `${tag.Key}=${tag.Value}`);
}

describe("sim SSM parameter tags", () => {
  it("holds the tags a parameter is created with, and changes them on request", async () => {
    // Given a parameter created with two tags
    const simAws = new SimAws();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/orders/db-host",
        Type: "String",
        Value: "db.internal",
        Tags: [
          { Key: "team", Value: "orders" },
          { Key: "stage", Value: "test" },
        ],
      }),
    );

    // When one is replaced, one added and one removed, naming the parameter
    // without its leading slash
    await simAws.ssm().addTagsToResource(
      new AddTagsToResourceCommand({
        ResourceType: "Parameter",
        ResourceId: "orders/db-host",
        Tags: [
          { Key: "stage", Value: "prod" },
          { Key: "cost", Value: "42" },
        ],
      }),
    );
    await simAws.ssm().removeTagsFromResource(
      new RemoveTagsFromResourceCommand({
        ResourceType: "Parameter",
        ResourceId: "/orders/db-host",
        TagKeys: ["team"],
      }),
    );

    // Then the parameter holds the result
    assertArrayEquals(await tagsOf(simAws, "/orders/db-host"), [
      "stage=prod",
      "cost=42",
    ]);
  });

  it("refuses tags on a request that overwrites", async () => {
    // Given a parameter
    const simAws = new SimAws();
    await teamParameter(simAws, "orders");

    // When it is overwritten with tags
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().putParameter(
        new PutParameterCommand({
          Name: "/orders/db-host",
          Type: "String",
          Value: "db.other",
          Overwrite: true,
          Tags: [{ Key: "team", Value: "billing" }],
        }),
      ),
    );

    // Then the request is refused, and the parameter keeps its value
    assertInstanceOf(error, SimSsmValidationException);
    assertIdentical(
      simAws.ssm().findParameter("/orders/db-host")?.currentVersion.value.value,
      "db.internal",
    );
  });

  it("refuses a request that would leave a parameter over 50 tags", async () => {
    // Given a parameter holding one tag
    const simAws = new SimAws();
    await teamParameter(simAws, "orders");

    // When fifty more are added
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().addTagsToResource(
        new AddTagsToResourceCommand({
          ResourceType: "Parameter",
          ResourceId: "/orders/db-host",
          Tags: Array.from({ length: 50 }, (_, index) => ({
            Key: `key-${String(index)}`,
            Value: "value",
          })),
        }),
      ),
    );

    // Then the request is refused whole
    assertInstanceOf(error, SimSsmTooManyTagsError);
    assertArrayEquals(await tagsOf(simAws, "/orders/db-host"), ["team=orders"]);
  });

  it("answers InvalidResourceId and InvalidResourceType for what it cannot tag", async () => {
    // Given a simulation with no parameters
    const simAws = new SimAws();

    // When a missing parameter and a document are tagged
    const missing = await assertThrowsErrorAsync(async () =>
      simAws.ssm().addTagsToResource(
        new AddTagsToResourceCommand({
          ResourceType: "Parameter",
          ResourceId: "/missing",
          Tags: [{ Key: "team", Value: "orders" }],
        }),
      ),
    );
    const document = await assertThrowsErrorAsync(async () =>
      simAws.ssm().addTagsToResource(
        new AddTagsToResourceCommand({
          ResourceType: "Document",
          ResourceId: "my-document",
          Tags: [{ Key: "team", Value: "orders" }],
        }),
      ),
    );

    // Then each is refused with the error SSM gives it
    assertInstanceOf(missing, SimSsmInvalidResourceId);
    assertInstanceOf(document, SimSsmInvalidResourceType);
  });

  it("needs ssm:AddTagsToResource to create a parameter with tags", async () => {
    // Given a caller allowed to put parameters and nothing else
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { actions: ["ssm:PutParameter"] },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;
    const put = async (Name: string, team?: string): Promise<unknown> =>
      simAws.ssm().putParameter(
        new PutParameterCommand({
          Name,
          Type: "String",
          Value: "value",
          Tags: team === undefined ? [] : [{ Key: "team", Value: team }],
        }),
        { caller },
      );

    // When it puts one parameter with an empty tag list, and one with a tag
    await put("/plain");
    const error = await assertThrowsErrorAsync(async () =>
      put("/tagged", "orders"),
    );

    // Then only the parameter carrying a tag is refused
    assertInstanceOf(error, SimIamAccessDenied);
    assertUndefined(simAws.ssm().findParameter("/tagged"));
  });

  it("lets a policy decide a read on the parameter's tags", async () => {
    // Given two parameters tagged for different teams, and a caller allowed
    // to read those tagged for its own
    const simAws = new SimAws();
    await teamParameter(simAws, "orders");
    await teamParameter(simAws, "billing");
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["ssm:GetParameter"],
        condition: { StringEquals: { "ssm:ResourceTag/team": "orders" } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it reads each
    const read = await simAws
      .ssm()
      .getParameter(new GetParameterCommand({ Name: "/orders/db-host" }), {
        caller,
      });
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .getParameter(new GetParameterCommand({ Name: "/billing/db-host" }), {
          caller,
        }),
    );

    // Then only its own team's parameter is read
    assertIdentical(read.Parameter?.Value, "db.internal");
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("gives IAM the keys AddTagsToResource and RemoveTagsFromResource name", async () => {
    // Given a tagged parameter, and a caller allowed to tag and untag only
    // the cost key
    const simAws = new SimAws();
    await teamParameter(simAws, "orders");
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["ssm:AddTagsToResource", "ssm:RemoveTagsFromResource"],
        condition: { "ForAllValues:StringEquals": { "aws:TagKeys": ["cost"] } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;
    const target = {
      ResourceType: "Parameter",
      ResourceId: "/orders/db-host",
    } as const;

    // When it sets and removes the cost key, then tries the team key
    await simAws.ssm().addTagsToResource(
      new AddTagsToResourceCommand({
        ...target,
        Tags: [{ Key: "cost", Value: "42" }],
      }),
      { caller },
    );
    await simAws
      .ssm()
      .removeTagsFromResource(
        new RemoveTagsFromResourceCommand({ ...target, TagKeys: ["cost"] }),
        { caller },
      );
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .removeTagsFromResource(
          new RemoveTagsFromResourceCommand({ ...target, TagKeys: ["team"] }),
          { caller },
        ),
    );

    // Then only the team key is refused
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
