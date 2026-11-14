import {
  AttachRolePolicyCommand,
  AttachUserPolicyCommand,
  CreateRoleCommand,
  CreateUserCommand,
  DeleteUserPolicyCommand,
  DetachUserPolicyCommand,
  GetRolePolicyCommand,
  GetUserPolicyCommand,
  ListRolePoliciesCommand,
  ListUserPoliciesCommand,
  PutRolePolicyCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { faker } from "@faker-js/faker";
import {
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { jsonStringify } from "../../../../util/type-guard/json.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimIamLimitExceeded,
  SimIamNoSuchEntity,
} from "../../error/sim-iam.error.js";
import { simIamPolicyDocumentOfSize } from "../../policy/sim-iam-policy-document-of-size.js";
import { simIamPolicyDocumentFactory } from "../../policy/sim-iam-policy-document.factory.js";
import type { SimIam } from "../../sim-iam.js";

const readObjects = simIamPolicyDocumentFactory.make({
  Statement: { Action: "s3:GetObject", Resource: "*" },
});

/**
 * A simulated IAM holding one User, under a name of its own.
 */
async function withUser(): Promise<{
  readonly iam: SimIam;
  readonly username: string;
}> {
  const iam = new SimAws().account(makeSimAwsAccountId()).iam();
  const username = `user-${faker.string.alphanumeric(8)}`;
  await iam.createUser(new CreateUserCommand({ UserName: username }));

  return { iam, username };
}

/**
 * Whether the User may read an object.
 */
function mayRead(iam: SimIam, username: string): boolean {
  const principal = {
    kind: "arn" as const,
    arn: `arn:aws:iam::${iam.accountId}:user/${username}`,
  };

  return iam.authorize({
    action: "s3:GetObject",
    resource: "arn:aws:s3:::reports/summary.csv",
    caller: { kind: "resolved", principal, identityPolicyPrincipal: principal },
  }).isAllowed;
}

describe("IAM inline User policy commands", () => {
  it("reads, lists and deletes a User's inline policy", async () => {
    // Given a User with an inline policy allowing reads
    const { iam, username } = await withUser();
    await iam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: username,
        PolicyName: "read",
        PolicyDocument: readObjects,
      }),
    );

    // When the policy is read, listed and deleted
    const got = await iam.getUserPolicy(
      new GetUserPolicyCommand({ UserName: username, PolicyName: "read" }),
    );
    const listed = await iam.listUserPolicies(
      new ListUserPoliciesCommand({ UserName: username }),
    );
    const allowedBefore = mayRead(iam, username);
    await iam.deleteUserPolicy(
      new DeleteUserPolicyCommand({ UserName: username, PolicyName: "read" }),
    );

    // Then IAM answered the URL-encoded document, listed its name, and the
    // grant went with the policy
    assertIdentical(decodeURIComponent(got.PolicyDocument), readObjects);
    assertIdentical(got["UserName"], username);
    assertArrayEquals(listed.PolicyNames, ["read"]);
    assertTrue(allowedBefore);
    assertFalse(mayRead(iam, username));
  });

  it("refuses to delete an inline policy the User does not carry", async () => {
    // Given a User with no inline policy
    const { iam, username } = await withUser();

    // When a policy is deleted from it
    const error = await assertThrowsErrorAsync(async () =>
      iam.deleteUserPolicy(
        new DeleteUserPolicyCommand({ UserName: username, PolicyName: "read" }),
      ),
    );

    // Then IAM finds nothing to delete
    assertInstanceOf(error, SimIamNoSuchEntity);
    assertIdentical(
      error.message,
      "The user policy with name read cannot be found.",
    );
  });

  it("refuses inline policies on a User that sum past 2,048 characters", async () => {
    // Given a User holding a 1,500-character inline policy
    const { iam, username } = await withUser();
    const put = (PolicyName: string, size: number) => {
      const PolicyDocument = jsonStringify(simIamPolicyDocumentOfSize(size));

      return iam.putUserPolicy(
        new PutUserPolicyCommand({
          UserName: username,
          PolicyName,
          PolicyDocument,
        }),
      );
    };
    await put("first", 1500);

    // When a second of 600 characters is put on it, and the first is replaced
    // with one of 1,400
    const error = await assertThrowsErrorAsync(async () => put("second", 600));
    await put("first", 1400);
    await put("second", 600);

    // Then only the policy taking the total past the limit is refused
    assertInstanceOf(error, SimIamLimitExceeded);
    assertIdentical(
      error.message,
      `Maximum policy size of 2048 bytes exceeded for user ${username}`,
    );
  });
});

describe("IAM managed User policy commands", () => {
  it("detaches a managed policy, taking its grant with it", async () => {
    // Given a User with a managed policy attached
    const { iam, username } = await withUser();
    const PolicyArn = "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess";
    await iam.attachUserPolicy(
      new AttachUserPolicyCommand({ UserName: username, PolicyArn }),
    );
    const allowedBefore = mayRead(iam, username);

    // When it is detached, and then detached again
    await iam.detachUserPolicy(
      new DetachUserPolicyCommand({ UserName: username, PolicyArn }),
    );
    const error = await assertThrowsErrorAsync(async () =>
      iam.detachUserPolicy(
        new DetachUserPolicyCommand({ UserName: username, PolicyArn }),
      ),
    );

    // Then the grant went, and the second detach found nothing
    assertTrue(allowedBefore);
    assertFalse(mayRead(iam, username));
    assertInstanceOf(error, SimIamNoSuchEntity);
  });

  it("refuses an eleventh managed policy on a User", async () => {
    // Given a User with ten managed policies attached
    const { iam, username } = await withUser();
    const attach = (index: number) =>
      iam.attachUserPolicy(
        new AttachUserPolicyCommand({
          UserName: username,
          PolicyArn: `arn:aws:iam::${iam.accountId}:policy/P${String(index)}`,
        }),
      );
    await Promise.all(
      Array.from({ length: 10 }, async (_, index) => attach(index)),
    );

    // When an eleventh is attached, and one already attached is attached again
    const error = await assertThrowsErrorAsync(async () => attach(10));
    await attach(0);

    // Then only the eleventh is refused
    assertInstanceOf(error, SimIamLimitExceeded);
    assertIdentical(
      error.message,
      "Cannot exceed quota for PoliciesPerUser: 10",
    );
  });
});

describe("IAM Role policy commands", () => {
  it("reads and lists a Role's inline policies", async () => {
    // Given a Role with two inline policies
    const iam = new SimAws().account(makeSimAwsAccountId()).iam();
    await iam.createRole(
      new CreateRoleCommand({
        RoleName: "Reader",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { Service: "lambda.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await Promise.all(
      ["write", "read"].map(async (PolicyName) =>
        iam.putRolePolicy(
          new PutRolePolicyCommand({
            RoleName: "Reader",
            PolicyName,
            PolicyDocument: readObjects,
          }),
        ),
      ),
    );

    // When one is read and both are listed
    const got = await iam.getRolePolicy(
      new GetRolePolicyCommand({ RoleName: "Reader", PolicyName: "read" }),
    );
    const listed = await iam.listRolePolicies(
      new ListRolePoliciesCommand({ RoleName: "Reader" }),
    );

    // Then IAM answers the document and lists the names in order
    assertIdentical(got["RoleName"], "Reader");
    assertIdentical(decodeURIComponent(got.PolicyDocument), readObjects);
    assertArrayEquals(listed.PolicyNames, ["read", "write"]);
  });

  it("refuses a twenty-first managed policy on a Role", async () => {
    // Given a Role with twenty managed policies attached
    const iam = new SimAws().account(makeSimAwsAccountId()).iam();
    await iam.createRole(
      new CreateRoleCommand({
        RoleName: "Busy",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { Service: "lambda.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    const attach = (index: number) =>
      iam.attachRolePolicy(
        new AttachRolePolicyCommand({
          RoleName: "Busy",
          PolicyArn: `arn:aws:iam::${iam.accountId}:policy/P${String(index)}`,
        }),
      );
    await Promise.all(
      Array.from({ length: 20 }, async (_, index) => attach(index)),
    );

    // When a twenty-first is attached
    const error = await assertThrowsErrorAsync(async () => attach(20));

    // Then IAM refuses it
    assertInstanceOf(error, SimIamLimitExceeded);
    assertIdentical(
      error.message,
      "Cannot exceed quota for PoliciesPerRole: 20",
    );
  });
});
