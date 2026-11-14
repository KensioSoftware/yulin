import {
  AddUserToGroupCommand,
  AttachGroupPolicyCommand,
  CreateAccessKeyCommand,
  CreateGroupCommand,
  CreatePolicyCommand,
  CreatePolicyVersionCommand,
  CreateUserCommand,
  DeleteAccessKeyCommand,
  GetGroupCommand,
  GetPolicyVersionCommand,
  GetUserCommand,
  ListAccessKeysCommand,
  ListAttachedGroupPoliciesCommand,
  ListGroupsCommand,
  ListPolicyVersionsCommand,
  ListUserPoliciesCommand,
  PutUserPolicyCommand,
  RemoveUserFromGroupCommand,
  SetDefaultPolicyVersionCommand,
  UpdateAccessKeyCommand,
} from "@aws-sdk/client-iam";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimAws } from "../../aws/sim-aws.js";
import {
  SimIamEntityAlreadyExists,
  SimIamInvalidMarkerException,
  SimIamNoSuchEntity,
  SimIamValidationError,
} from "../error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../policy/sim-iam-policy-document.factory.js";
import type { SimIam } from "../sim-iam.js";

const readObjects = simIamPolicyDocumentFactory.make({
  Statement: { Action: "s3:GetObject", Resource: "*" },
});

/**
 * A simulated IAM holding a User with two inline policies and two access
 * keys, in two groups, one of which carries two managed policies.
 */
async function populated(): Promise<SimIam> {
  const iam = new SimAws().account(makeSimAwsAccountId()).iam();
  await iam.createUser(new CreateUserCommand({ UserName: "analyst" }));
  await iam.createUser(new CreateUserCommand({ UserName: "auditor" }));
  await iam.putUserPolicy(
    new PutUserPolicyCommand({
      UserName: "analyst",
      PolicyName: "a",
      PolicyDocument: readObjects,
    }),
  );
  await iam.putUserPolicy(
    new PutUserPolicyCommand({
      UserName: "analyst",
      PolicyName: "b",
      PolicyDocument: readObjects,
    }),
  );
  await iam.createAccessKey(
    new CreateAccessKeyCommand({ UserName: "analyst" }),
  );
  await iam.createAccessKey(
    new CreateAccessKeyCommand({ UserName: "analyst" }),
  );
  await iam.createGroup(new CreateGroupCommand({ GroupName: "Readers" }));
  await iam.createGroup(new CreateGroupCommand({ GroupName: "Writers" }));
  await iam.addUserToGroup(
    new AddUserToGroupCommand({ GroupName: "Readers", UserName: "analyst" }),
  );
  await iam.addUserToGroup(
    new AddUserToGroupCommand({ GroupName: "Readers", UserName: "auditor" }),
  );
  await iam.attachGroupPolicy(
    new AttachGroupPolicyCommand({
      GroupName: "Readers",
      PolicyArn: "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
    }),
  );
  await iam.attachGroupPolicy(
    new AttachGroupPolicyCommand({
      GroupName: "Readers",
      PolicyArn: "arn:aws:iam::aws:policy/ReadOnlyAccess",
    }),
  );

  return iam;
}

describe("IAM listings a page at a time", () => {
  it("pages every listing one item at a time", async () => {
    // Given an Account holding two of everything
    const iam = await populated();

    // When each listing is asked for one item
    const policies = await iam.listUserPolicies(
      new ListUserPoliciesCommand({ UserName: "analyst", MaxItems: 1 }),
    );
    const keys = await iam.listAccessKeys(
      new ListAccessKeysCommand({ UserName: "analyst", MaxItems: 1 }),
    );
    const groups = await iam.listGroups(new ListGroupsCommand({ MaxItems: 1 }));
    const members = await iam.getGroup(
      new GetGroupCommand({ GroupName: "Readers", MaxItems: 1 }),
    );
    const attached = await iam.listAttachedGroupPolicies(
      new ListAttachedGroupPoliciesCommand({
        GroupName: "Readers",
        MaxItems: 1,
      }),
    );

    // Then each answers a truncated first page
    assertArrayEquals(
      [policies, keys, groups, members, attached].map(
        (page) => page.IsTruncated,
      ),
      [true, true, true, true, true],
    );
    assertArrayEquals(policies.PolicyNames, ["a"]);
    assertIdentical(members.Users[0]?.UserName, "analyst");
  });

  it("refuses a marker it never issued, and a page size out of range", async () => {
    // Given an Account
    const iam = await populated();
    const list = (input: { Marker?: string; MaxItems?: number }) =>
      assertThrowsErrorAsync(async () =>
        iam.listGroups(new ListGroupsCommand(input)),
      );

    // When groups are listed from a made-up marker and with page sizes 0 and
    // 1,001
    const marker = await list({ Marker: "bm90LWEtZ3JvdXA" });
    const empty = await list({ MaxItems: 0 });
    const large = await list({ MaxItems: 1001 });

    // Then each is refused
    assertInstanceOf(marker, SimIamInvalidMarkerException);
    assertInstanceOf(empty, SimIamValidationError);
    assertInstanceOf(large, SimIamValidationError);
  });
});

describe("IAM refusals", () => {
  it("refuses a group command naming no group, or a group name IAM refuses", async () => {
    // Given an Account
    const iam = await populated();
    const create = (GroupName?: string) =>
      assertThrowsErrorAsync(async () =>
        iam.createGroup(new CreateGroupCommand({ GroupName })),
      );

    // When groups are created with no name, a space and 129 characters
    const missing = await create();
    const spaced = await create("night shift");
    const long = await create("g".repeat(129));

    // Then IAM refuses each
    assertInstanceOf(missing, SimIamValidationError);
    assertInstanceOf(spaced, SimIamValidationError);
    assertInstanceOf(long, SimIamValidationError);
  });

  it("refuses to take a User out of a group it is not in", async () => {
    // Given a User outside the Writers group
    const iam = await populated();

    // When it is taken out of the group
    const error = await assertThrowsErrorAsync(async () =>
      iam.removeUserFromGroup(
        new RemoveUserFromGroupCommand({
          GroupName: "Writers",
          UserName: "analyst",
        }),
      ),
    );

    // Then IAM finds no membership
    assertInstanceOf(error, SimIamNoSuchEntity);
  });

  it("refuses a User the Account does not hold, and an anonymous caller naming none", async () => {
    // Given an Account
    const iam = await populated();

    // When a missing User is read, and an anonymous caller asks for itself
    const missing = await assertThrowsErrorAsync(async () =>
      iam.getUser(new GetUserCommand({ UserName: "nobody" })),
    );
    const anonymous = await assertThrowsErrorAsync(async () =>
      iam.getUser(new GetUserCommand({}), {
        caller: { kind: "anonymous" },
      }),
    );

    // Then IAM refuses both
    assertInstanceOf(missing, SimIamNoSuchEntity);
    assertIdentical(
      missing.message,
      "The user with name nobody cannot be found.",
    );
    assertInstanceOf(anonymous, SimIamValidationError);
  });

  it("refuses an access key status IAM does not define", async () => {
    // Given a User with an access key
    const iam = await populated();
    const { AccessKeyMetadata } = await iam.listAccessKeys(
      new ListAccessKeysCommand({ UserName: "analyst" }),
    );

    // When the key is given a status of its own
    const error = await assertThrowsErrorAsync(async () =>
      iam.updateAccessKey(
        new UpdateAccessKeyCommand({
          UserName: "analyst",
          AccessKeyId: AccessKeyMetadata[0]?.AccessKeyId,
          Status: "Paused" as "Active",
        }),
      ),
    );

    // Then IAM refuses it
    assertInstanceOf(error, SimIamValidationError);
  });

  it("refuses a policy or version that does not exist", async () => {
    // Given a managed policy with two versions
    const iam = await populated();
    const { Policy } = await iam.createPolicy(
      new CreatePolicyCommand({ PolicyName: "P", PolicyDocument: readObjects }),
    );
    await iam.createPolicyVersion(
      new CreatePolicyVersionCommand({
        PolicyArn: Policy.Arn,
        PolicyDocument: readObjects,
      }),
    );
    const missingArn = `arn:aws:iam::${iam.accountId}:policy/Missing`;

    // When a missing version is made the default or read, the versions of a
    // missing policy listed, and its versions listed one to a page
    const version = await assertThrowsErrorAsync(async () =>
      iam.setDefaultPolicyVersion(
        new SetDefaultPolicyVersionCommand({
          PolicyArn: Policy.Arn,
          VersionId: "v9",
        }),
      ),
    );
    const read = await assertThrowsErrorAsync(async () =>
      iam.getPolicyVersion(
        new GetPolicyVersionCommand({ PolicyArn: missingArn, VersionId: "v1" }),
      ),
    );
    const policy = await assertThrowsErrorAsync(async () =>
      iam.listPolicyVersions(
        new ListPolicyVersionsCommand({ PolicyArn: missingArn }),
      ),
    );
    const page = await iam.listPolicyVersions(
      new ListPolicyVersionsCommand({ PolicyArn: Policy.Arn, MaxItems: 1 }),
    );

    // Then each missing one is refused, and the page holds the newest
    assertInstanceOf(version, SimIamNoSuchEntity);
    assertInstanceOf(read, SimIamNoSuchEntity);
    assertInstanceOf(policy, SimIamNoSuchEntity);
    assertIdentical(page.Versions[0]?.VersionId, "v2");
  });

  it("refuses a group name that differs from another only in case", async () => {
    // Given a group named Readers
    const iam = await populated();

    // When a group named readers is created
    const error = await assertThrowsErrorAsync(async () =>
      iam.createGroup(new CreateGroupCommand({ GroupName: "readers" })),
    );

    // Then IAM holds the two names as one
    assertInstanceOf(error, SimIamEntityAlreadyExists);
  });

  it("leaves a key deleted while it is made active at the same time", async () => {
    // Given a User's access key
    const iam = await populated();
    const { AccessKeyMetadata } = await iam.listAccessKeys(
      new ListAccessKeysCommand({ UserName: "analyst" }),
    );
    const AccessKeyId = AccessKeyMetadata[0]?.AccessKeyId;

    // When it is deleted and made active at once
    await Promise.allSettled([
      iam.deleteAccessKey(
        new DeleteAccessKeyCommand({ UserName: "analyst", AccessKeyId }),
      ),
      iam.updateAccessKey(
        new UpdateAccessKeyCommand({
          UserName: "analyst",
          AccessKeyId,
          Status: "Active",
        }),
      ),
    ]);

    // Then the key is gone
    const after = await iam.listAccessKeys(
      new ListAccessKeysCommand({ UserName: "analyst" }),
    );
    assertArrayLength(after.AccessKeyMetadata, 1);
  });
});
