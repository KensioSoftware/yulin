import {
  CreateAliasCommand,
  CreateKeyCommand,
  EncryptCommand,
  ListResourceTagsCommand,
  ScheduleKeyDeletionCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from "@aws-sdk/client-kms";
import {
  assertArrayEquals,
  assertFalse,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import {
  SimKmsAccessDeniedException,
  SimKmsInvalidStateException,
  SimKmsLimitExceededException,
  SimKmsNotFoundException,
  SimKmsTagException,
} from "../../error/sim-kms.error.js";

/**
 * Create a key tagged for the team given, and answer with its ID.
 */
async function teamKey(simAws: SimAws, team: string): Promise<string> {
  const created = await simAws
    .kms()
    .createKey(
      new CreateKeyCommand({ Tags: [{ TagKey: "team", TagValue: team }] }),
    );

  return created.KeyMetadata?.KeyId ?? "";
}

/**
 * The tags a key holds, as `Key=Value` strings in the order listed.
 */
async function tagsOf(simAws: SimAws, KeyId: string): Promise<string[]> {
  const listed = await simAws
    .kms()
    .listResourceTags(new ListResourceTagsCommand({ KeyId }));

  assertFalse(listed.Truncated);

  return listed.Tags.map((tag) => `${tag.TagKey}=${tag.TagValue}`);
}

describe("sim KMS key tags", () => {
  it("holds the tags a key is created with, and changes them on request", async () => {
    // Given a key created with two tags
    const simAws = new SimAws();
    const created = await simAws.kms().createKey(
      new CreateKeyCommand({
        Tags: [
          { TagKey: "team", TagValue: "orders" },
          { TagKey: "stage", TagValue: "test" },
        ],
      }),
    );
    const KeyId = created.KeyMetadata?.Arn ?? "";

    // When one is replaced, one added and one removed, naming the key by ARN
    await simAws.kms().tagResource(
      new TagResourceCommand({
        KeyId,
        Tags: [
          { TagKey: "stage", TagValue: "prod" },
          { TagKey: "cost", TagValue: "42" },
        ],
      }),
    );
    await simAws
      .kms()
      .untagResource(new UntagResourceCommand({ KeyId, TagKeys: ["team"] }));

    // Then the key holds the result
    assertArrayEquals(await tagsOf(simAws, KeyId), ["stage=prod", "cost=42"]);
  });

  it("refuses a reserved key, and a request leaving a key over 50 tags", async () => {
    // Given a key holding one tag
    const simAws = new SimAws();
    const KeyId = await teamKey(simAws, "orders");
    const Tags = Array.from({ length: 50 }, (_, index) => ({
      TagKey: `key-${String(index)}`,
      TagValue: "value",
    }));

    // When a reserved key is added, and then fifty more
    const reserved = await assertThrowsErrorAsync(async () =>
      simAws.kms().tagResource(
        new TagResourceCommand({
          KeyId,
          Tags: [{ TagKey: "aws:owner", TagValue: "me" }],
        }),
      ),
    );
    const tooMany = await assertThrowsErrorAsync(async () =>
      simAws.kms().tagResource(new TagResourceCommand({ KeyId, Tags })),
    );

    // Then both are refused whole
    assertInstanceOf(reserved, SimKmsTagException);
    assertInstanceOf(tooMany, SimKmsLimitExceededException);
    assertArrayEquals(await tagsOf(simAws, KeyId), ["team=orders"]);
  });

  it("refuses an alias, and a key pending deletion", async () => {
    // Given a key with an alias, and another pending deletion
    const simAws = new SimAws();
    const aliased = await teamKey(simAws, "orders");
    const deleted = await teamKey(simAws, "billing");
    await simAws.kms().createAlias(
      new CreateAliasCommand({
        AliasName: "alias/orders",
        TargetKeyId: aliased,
      }),
    );
    await simAws
      .kms()
      .scheduleKeyDeletion(new ScheduleKeyDeletionCommand({ KeyId: deleted }));
    const Tags = [{ TagKey: "cost", TagValue: "42" }];

    // When each is tagged
    const alias = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .tagResource(new TagResourceCommand({ KeyId: "alias/orders", Tags })),
    );
    const pending = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .tagResource(new TagResourceCommand({ KeyId: deleted, Tags })),
    );

    // Then both are refused, and the key pending deletion still lists its
    // tags
    assertInstanceOf(alias, SimKmsNotFoundException);
    assertInstanceOf(pending, SimKmsInvalidStateException);
    assertArrayEquals(await tagsOf(simAws, deleted), ["team=billing"]);
  });

  it("needs kms:TagResource to create a key with tags", async () => {
    // Given a caller allowed to create keys and nothing else
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { actions: ["kms:CreateKey"] },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it creates a key with an empty tag list, and one with a tag
    const plain = await simAws
      .kms()
      .createKey(new CreateKeyCommand({ Tags: [] }), { caller });
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().createKey(
        new CreateKeyCommand({
          Tags: [{ TagKey: "team", TagValue: "orders" }],
        }),
        { caller },
      ),
    );

    // Then only the key carrying a tag is refused
    assertTypeString(plain.KeyMetadata?.KeyId);
    assertInstanceOf(error, SimKmsAccessDeniedException);
  });

  it("lets an IAM policy decide a request on the key's tags", async () => {
    // Given two keys tagged for different teams, whose default policies
    // delegate to IAM, and a caller allowed to encrypt with those tagged for
    // its own
    const simAws = new SimAws();
    const orders = await teamKey(simAws, "orders");
    const billing = await teamKey(simAws, "billing");
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["kms:Encrypt"],
        condition: { StringEquals: { "aws:ResourceTag/team": "orders" } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;
    const Plaintext = new TextEncoder().encode("hi");

    // When it encrypts with each
    const encrypted = await simAws
      .kms()
      .encrypt(new EncryptCommand({ KeyId: orders, Plaintext }), { caller });
    const error = await assertThrowsErrorAsync(async () =>
      simAws.kms().encrypt(new EncryptCommand({ KeyId: billing, Plaintext }), {
        caller,
      }),
    );

    // Then only its own team's key encrypts
    assertTypeString(encrypted.KeyId);
    assertInstanceOf(error, SimKmsAccessDeniedException);
  });

  it("gives IAM the keys TagResource and UntagResource name", async () => {
    // Given a tagged key, and a caller allowed to tag and untag only the
    // cost key
    const simAws = new SimAws();
    const KeyId = await teamKey(simAws, "orders");
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["kms:TagResource", "kms:UntagResource"],
        condition: { "ForAllValues:StringEquals": { "aws:TagKeys": ["cost"] } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it sets and removes the cost key, then tries the team key
    await simAws.kms().tagResource(
      new TagResourceCommand({
        KeyId,
        Tags: [{ TagKey: "cost", TagValue: "42" }],
      }),
      { caller },
    );
    await simAws
      .kms()
      .untagResource(new UntagResourceCommand({ KeyId, TagKeys: ["cost"] }), {
        caller,
      });
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kms()
        .untagResource(new UntagResourceCommand({ KeyId, TagKeys: ["team"] }), {
          caller,
        }),
    );

    // Then only the team key is refused
    assertInstanceOf(error, SimKmsAccessDeniedException);
  });
});
