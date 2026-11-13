import {
  CreateRoleCommand,
  CreateUserCommand,
  GetRoleCommand,
  ListRoleTagsCommand,
  ListUserTagsCommand,
  TagRoleCommand,
  TagUserCommand,
  UntagRoleCommand,
  UntagUserCommand,
} from "@aws-sdk/client-iam";
import {
  assertArrayEquals,
  assertIdentical,
  assertObjectEquals,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimIam } from "../../sim-iam.js";
import { simIamPolicyDocumentFactory } from "../../policy/sim-iam-policy-document.factory.js";

/**
 * A Role trusted by the Account root, with the tags given.
 */
async function createRole(
  simIam: SimIam,
  roleName: string,
  tags?: { Key: string; Value: string }[],
): Promise<void> {
  await simIam.createRole(
    new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: `arn:aws:iam::${simIam.accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
      Tags: tags,
    }),
  );
}

describe("sim IAM Role and User tags", () => {
  it("creates a Role with tags and describes them", async () => {
    // Given a Role created with two tags
    const simIam = new SimAws().iam();
    await createRole(simIam, "OrdersRole", [
      { Key: "team", Value: "orders" },
      { Key: "cost-centre", Value: "1234" },
    ]);

    // When the Role and its tags are read back
    const role = await simIam.getRole(
      new GetRoleCommand({ RoleName: "OrdersRole" }),
    );
    const listing = await simIam.listRoleTags(
      new ListRoleTagsCommand({ RoleName: "OrdersRole" }),
    );

    // Then both answers carry them
    assertArrayEquals(role.Role.Tags ?? [], listing.Tags);
    assertArrayEquals(
      listing.Tags.map((tag) => `${tag.Key}=${tag.Value}`),
      ["team=orders", "cost-centre=1234"],
    );
  });

  it("leaves Tags out of a Role created without any", async () => {
    // Given a Role created with no tags
    const simIam = new SimAws().iam();
    await createRole(simIam, "PlainRole");

    // When it is read back
    const role = await simIam.getRole(
      new GetRoleCommand({ RoleName: "PlainRole" }),
    );

    // Then the member is absent, as IAM leaves it out
    assertUndefined(role.Role.Tags);
  });

  it("replaces a Role tag whose key differs only in case", async () => {
    // Given a Role tagged Department=finance
    const simIam = new SimAws().iam();
    await createRole(simIam, "FinanceRole", [
      { Key: "Department", Value: "finance" },
    ]);

    // When it is tagged department=hr
    await simIam.tagRole(
      new TagRoleCommand({
        RoleName: "FinanceRole",
        Tags: [{ Key: "department", Value: "hr" }],
      }),
    );

    // Then the one tag holds the new value under the new spelling
    const listing = await simIam.listRoleTags(
      new ListRoleTagsCommand({ RoleName: "FinanceRole" }),
    );
    assertArrayEquals(
      listing.Tags.map((tag) => `${tag.Key}=${tag.Value}`),
      ["department=hr"],
    );
  });

  it("removes tags by key whatever their case, passing over unknown keys", async () => {
    // Given a Role carrying two tags
    const simIam = new SimAws().iam();
    await createRole(simIam, "ReportsRole", [
      { Key: "Team", Value: "reports" },
      { Key: "Stage", Value: "prod" },
    ]);

    // When two keys are removed, one in another case and one never set
    await simIam.untagRole(
      new UntagRoleCommand({
        RoleName: "ReportsRole",
        TagKeys: ["team", "Owner"],
      }),
    );

    // Then only the other tag is left
    const listing = await simIam.listRoleTags(
      new ListRoleTagsCommand({ RoleName: "ReportsRole" }),
    );
    assertArrayEquals(
      listing.Tags.map((tag) => tag.Key),
      ["Stage"],
    );
  });

  it("refuses a tag key under the reserved aws: prefix", async () => {
    // Given a Role
    const simIam = new SimAws().iam();
    await createRole(simIam, "ReservedRole");

    // When it is tagged under the aws: prefix
    const error = await assertThrowsErrorAsync(async () => {
      await simIam.tagRole(
        new TagRoleCommand({
          RoleName: "ReservedRole",
          Tags: [{ Key: "aws:createdBy", Value: "me" }],
        }),
      );
    });

    // Then IAM refuses it
    assertIdentical(error.name, "InvalidInput");
  });

  it("refuses two tags in one request whose keys differ only in case", async () => {
    // Given an Account
    const simIam = new SimAws().iam();

    // When a Role is created with Team and team
    const error = await assertThrowsErrorAsync(async () => {
      await createRole(simIam, "DuplicateRole", [
        { Key: "Team", Value: "a" },
        { Key: "team", Value: "b" },
      ]);
    });

    // Then IAM refuses it and creates no Role
    assertIdentical(error.name, "InvalidInput");
    assertUndefined(simIam.roles.get("DuplicateRole" as never));
  });

  it("refuses tags that would take a Role past fifty", async () => {
    // Given a Role carrying fifty tags
    const simIam = new SimAws().iam();
    await createRole(
      simIam,
      "CrowdedRole",
      Array.from({ length: 50 }, (_, index) => ({
        Key: `key-${String(index)}`,
        Value: "value",
      })),
    );

    // When one more is added
    const error = await assertThrowsErrorAsync(async () => {
      await simIam.tagRole(
        new TagRoleCommand({
          RoleName: "CrowdedRole",
          Tags: [{ Key: "one-more", Value: "value" }],
        }),
      );
    });

    // Then IAM refuses it over the quota
    assertIdentical(error.name, "LimitExceeded");
  });

  it("refuses to tag a Role that does not exist", async () => {
    // Given an Account with no Role named MissingRole
    const simIam = new SimAws().iam();

    // When it is tagged
    const error = await assertThrowsErrorAsync(async () => {
      await simIam.tagRole(
        new TagRoleCommand({
          RoleName: "MissingRole",
          Tags: [{ Key: "team", Value: "none" }],
        }),
      );
    });

    // Then IAM says there is no such Role
    assertIdentical(error.name, "NoSuchEntity");
  });

  it("tags, lists and untags a User", async () => {
    // Given a User created with one tag
    const simIam = new SimAws().iam();
    const creation = await simIam.createUser(
      new CreateUserCommand({
        UserName: "reporting",
        Tags: [{ Key: "team", Value: "reports" }],
      }),
    );

    // When a second tag is added and the first removed
    await simIam.tagUser(
      new TagUserCommand({
        UserName: "reporting",
        Tags: [{ Key: "stage", Value: "prod" }],
      }),
    );
    await simIam.untagUser(
      new UntagUserCommand({ UserName: "reporting", TagKeys: ["team"] }),
    );

    // Then the creation answered with the first and the listing holds the second
    assertObjectEquals(creation.User.Tags?.[0] ?? {}, {
      Key: "team",
      Value: "reports",
    });
    const listing = await simIam.listUserTags(
      new ListUserTagsCommand({ UserName: "reporting" }),
    );
    assertArrayEquals(
      listing.Tags.map((tag) => `${tag.Key}=${tag.Value}`),
      ["stage=prod"],
    );
  });

  it.each([
    ["a key with a character IAM refuses", [{ Key: "team*", Value: "x" }]],
    ["a tag with no value", [{ Key: "team" }]],
    [
      "a value longer than 256 characters",
      [{ Key: "team", Value: "x".repeat(257) }],
    ],
  ])("refuses %s", async (_, tags) => {
    // Given a Role
    const simIam = new SimAws().iam();
    await createRole(simIam, "CheckedRole");

    // When it is tagged with something IAM does not accept
    const error = await assertThrowsErrorAsync(async () => {
      await simIam.tagRole({ input: { RoleName: "CheckedRole", Tags: tags } });
    });

    // Then IAM refuses it
    assertIdentical(error.name, "InvalidInput");
  });

  it("refuses one request setting more than fifty tags", async () => {
    // Given a Role
    const simIam = new SimAws().iam();
    await createRole(simIam, "BusyRole");

    // When one request sets fifty-one tags
    const error = await assertThrowsErrorAsync(async () => {
      await simIam.tagRole(
        new TagRoleCommand({
          RoleName: "BusyRole",
          Tags: Array.from({ length: 51 }, (_, index) => ({
            Key: `key-${String(index)}`,
            Value: "value",
          })),
        }),
      );
    });

    // Then IAM refuses the request
    assertIdentical(error.name, "LimitExceeded");
  });

  it("refuses one request removing more than fifty keys", async () => {
    // Given a Role
    const simIam = new SimAws().iam();
    await createRole(simIam, "BusyRole");

    // When one request removes fifty-one keys
    const error = await assertThrowsErrorAsync(async () => {
      await simIam.untagRole(
        new UntagRoleCommand({
          RoleName: "BusyRole",
          TagKeys: Array.from(
            { length: 51 },
            (_, index) => `key-${String(index)}`,
          ),
        }),
      );
    });

    // Then IAM refuses it
    assertIdentical(error.name, "InvalidInput");
  });

  it("treats a request naming no tags or keys as changing nothing", async () => {
    // Given a Role carrying one tag
    const simIam = new SimAws().iam();
    await createRole(simIam, "SteadyRole", [{ Key: "team", Value: "steady" }]);

    // When it is tagged and untagged with neither tags nor keys given
    await simIam.tagRole({ input: { RoleName: "SteadyRole" } });
    await simIam.untagRole({ input: { RoleName: "SteadyRole" } });

    // Then it carries the tag it had
    const listing = await simIam.listRoleTags(
      new ListRoleTagsCommand({ RoleName: "SteadyRole" }),
    );
    assertArrayEquals(
      listing.Tags.map((tag) => tag.Key),
      ["team"],
    );
  });

  it("finds no Role for a request naming none", async () => {
    // Given an Account
    const simIam = new SimAws().iam();

    // When tags are listed for a request carrying no Role name
    const error = await assertThrowsErrorAsync(async () => {
      await simIam.listRoleTags({ input: {} });
    });

    // Then IAM says there is no such Role
    assertIdentical(error.name, "NoSuchEntity");
  });
});
