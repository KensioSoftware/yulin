import {
  AttachUserPolicyCommand,
  CreatePolicyCommand,
  CreatePolicyVersionCommand,
  CreateUserCommand,
  DeletePolicyCommand,
  DeletePolicyVersionCommand,
  GetPolicyCommand,
  GetPolicyVersionCommand,
  ListPolicyVersionsCommand,
  SetDefaultPolicyVersionCommand,
} from "@aws-sdk/client-iam";
import {
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { makeSimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import {
  SimIamDeleteConflict,
  SimIamLimitExceeded,
} from "../../../error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../policy/sim-iam-policy-document.factory.js";
import type { SimIam } from "../../../sim-iam.js";

const allow = (Action: string): string =>
  simIamPolicyDocumentFactory.make({ Statement: { Action, Resource: "*" } });

/**
 * A User holding a managed policy that allows reads, and a way to ask what
 * the User may do.
 */
async function withAttachedPolicy(): Promise<{
  readonly iam: SimIam;
  readonly policyArn: string;
  readonly may: (action: string) => boolean;
}> {
  const iam = new SimAws().account(makeSimAwsAccountId()).iam();
  const { Policy } = await iam.createPolicy(
    new CreatePolicyCommand({
      PolicyName: "Objects",
      PolicyDocument: allow("s3:GetObject"),
    }),
  );
  await iam.createUser(new CreateUserCommand({ UserName: "analyst" }));
  await iam.attachUserPolicy(
    new AttachUserPolicyCommand({ UserName: "analyst", PolicyArn: Policy.Arn }),
  );
  const principal = {
    kind: "arn" as const,
    arn: `arn:aws:iam::${iam.accountId}:user/analyst`,
  };

  return {
    iam,
    policyArn: Policy.Arn,
    may: (action) =>
      iam.authorize({
        action,
        resource: "*",
        caller: {
          kind: "resolved",
          principal,
          identityPolicyPrincipal: principal,
        },
      }).isAllowed,
  };
}

describe("IAM managed policy versions", () => {
  it("authorizes with the default version only", async () => {
    // Given a User's policy allowing reads
    const { iam, policyArn, may } = await withAttachedPolicy();

    // When a version allowing writes is added, and then made the default
    await iam.createPolicyVersion(
      new CreatePolicyVersionCommand({
        PolicyArn: policyArn,
        PolicyDocument: allow("s3:PutObject"),
      }),
    );
    const writeBeforeDefault = may("s3:PutObject");
    await iam.setDefaultPolicyVersion(
      new SetDefaultPolicyVersionCommand({
        PolicyArn: policyArn,
        VersionId: "v2",
      }),
    );

    // Then writes were allowed only once the new version was the default
    assertFalse(writeBeforeDefault);
    assertTrue(may("s3:PutObject"));
    assertFalse(may("s3:GetObject"));
  });

  it("makes a version the default as it is created, when asked", async () => {
    // Given a User's policy allowing reads
    const { iam, policyArn, may } = await withAttachedPolicy();

    // When a version allowing writes is created as the default
    const { PolicyVersion } = await iam.createPolicyVersion(
      new CreatePolicyVersionCommand({
        PolicyArn: policyArn,
        PolicyDocument: allow("s3:PutObject"),
        SetAsDefault: true,
      }),
    );

    // Then it is v2, the default, and what authorizes
    assertIdentical(PolicyVersion.VersionId, "v2");
    assertTrue(PolicyVersion.IsDefaultVersion);
    assertTrue(may("s3:PutObject"));
    const { Policy } = await iam.getPolicy(
      new GetPolicyCommand({ PolicyArn: policyArn }),
    );
    assertIdentical(Policy.DefaultVersionId, "v2");
  });

  it("lists versions newest first and reads any of them", async () => {
    // Given a policy with a second version
    const { iam, policyArn } = await withAttachedPolicy();
    await iam.createPolicyVersion(
      new CreatePolicyVersionCommand({
        PolicyArn: policyArn,
        PolicyDocument: allow("s3:PutObject"),
      }),
    );

    // When its versions are listed and the second is read
    const { Versions } = await iam.listPolicyVersions(
      new ListPolicyVersionsCommand({ PolicyArn: policyArn }),
    );
    const { PolicyVersion } = await iam.getPolicyVersion(
      new GetPolicyVersionCommand({ PolicyArn: policyArn, VersionId: "v2" }),
    );

    // Then both are listed, and the second answers its own document
    assertArrayEquals(
      Versions.map((version) => version.VersionId),
      ["v2", "v1"],
    );
    assertArrayEquals(
      Versions.map((version) => version.IsDefaultVersion),
      [false, true],
    );
    assertIdentical(
      decodeURIComponent(PolicyVersion.Document ?? ""),
      allow("s3:PutObject"),
    );
    assertFalse(PolicyVersion.IsDefaultVersion);
  });

  it("refuses a sixth version, and numbers on past a deleted one", async () => {
    // Given a policy holding five versions
    const { iam, policyArn } = await withAttachedPolicy();
    const create = () =>
      iam.createPolicyVersion(
        new CreatePolicyVersionCommand({
          PolicyArn: policyArn,
          PolicyDocument: allow("s3:PutObject"),
        }),
      );
    for (let count = 1; count < 5; count++) {
      // oxlint-disable-next-line no-await-in-loop -- IAM numbers versions in creation order
      await create();
    }

    // When a sixth is created, and then again once v5 is deleted
    const error = await assertThrowsErrorAsync(create);
    await iam.deletePolicyVersion(
      new DeletePolicyVersionCommand({ PolicyArn: policyArn, VersionId: "v5" }),
    );
    const { PolicyVersion } = await create();

    // Then the sixth is refused while five are held, and the next is v6
    assertInstanceOf(error, SimIamLimitExceeded);
    assertIdentical(
      error.message,
      "A managed policy can have up to 5 versions. Before you create a new " +
        "version, you must delete an existing version.",
    );
    assertIdentical(PolicyVersion.VersionId, "v6");
  });

  it("refuses to delete the default version, or a policy with others", async () => {
    // Given a policy with a second version, detached from everything
    const { iam, policyArn } = await withAttachedPolicy();
    await iam.createPolicyVersion(
      new CreatePolicyVersionCommand({
        PolicyArn: policyArn,
        PolicyDocument: allow("s3:PutObject"),
      }),
    );
    await iam.detachUserPolicy({
      input: { UserName: "analyst", PolicyArn: policyArn },
    });

    // When its default version is deleted, and then the policy
    const defaultVersion = await assertThrowsErrorAsync(async () =>
      iam.deletePolicyVersion(
        new DeletePolicyVersionCommand({
          PolicyArn: policyArn,
          VersionId: "v1",
        }),
      ),
    );
    const policy = await assertThrowsErrorAsync(async () =>
      iam.deletePolicy(new DeletePolicyCommand({ PolicyArn: policyArn })),
    );

    // Then IAM refuses both
    assertInstanceOf(defaultVersion, SimIamDeleteConflict);
    assertIdentical(
      defaultVersion.message,
      "Cannot delete the default version of a policy.",
    );
    assertInstanceOf(policy, SimIamDeleteConflict);
  });

  it("counts the entities a policy is attached to", async () => {
    // Given a policy attached to one User
    const { iam, policyArn } = await withAttachedPolicy();

    // When the policy is read
    const { Policy } = await iam.getPolicy(
      new GetPolicyCommand({ PolicyArn: policyArn }),
    );

    // Then it reports the attachment
    assertIdentical(Policy.AttachmentCount, 1);
  });
});
