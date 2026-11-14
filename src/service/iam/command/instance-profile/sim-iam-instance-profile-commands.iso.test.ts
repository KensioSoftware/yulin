import {
  AddRoleToInstanceProfileCommand,
  CreateInstanceProfileCommand,
  CreateRoleCommand,
  DeleteInstanceProfileCommand,
  DeleteRoleCommand,
  GetInstanceProfileCommand,
  ListInstanceProfilesCommand,
  ListInstanceProfilesForRoleCommand,
  RemoveRoleFromInstanceProfileCommand,
} from "@aws-sdk/client-iam";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertMapSize,
  assertStringStartsWith,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimIamAccessDenied,
  SimIamDeleteConflict,
  SimIamEntityAlreadyExists,
  SimIamLimitExceeded,
  SimIamNoSuchEntity,
  SimIamValidationError,
} from "../../error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../policy/sim-iam-policy-document.factory.js";
import type { SimIam } from "../../sim-iam.js";
import type { SimIamInstanceProfileName } from "../../instance-profile/sim-iam-instance-profile.js";

const trustEc2 = simIamPolicyDocumentFactory.make({
  Statement: {
    Principal: { Service: "ec2.amazonaws.com" },
    Action: "sts:AssumeRole",
  },
});

/**
 * A simulated IAM holding the named Roles, each trusting EC2.
 */
async function withRoles(...names: readonly string[]): Promise<SimIam> {
  const iam = new SimAws().account(makeSimAwsAccountId()).iam();
  await Promise.all(
    names.map(async (RoleName) =>
      iam.createRole(
        new CreateRoleCommand({ RoleName, AssumeRolePolicyDocument: trustEc2 }),
      ),
    ),
  );

  return iam;
}

describe("IAM instance profiles", () => {
  it("creates an instance profile, puts a Role in it and describes both", async () => {
    // Given a Role
    const iam = await withRoles("WebServer");

    // When an instance profile is created at a path and the Role added to it
    const created = await iam.createInstanceProfile(
      new CreateInstanceProfileCommand({
        InstanceProfileName: "Web",
        Path: "/fleet/",
        Tags: [{ Key: "team", Value: "web" }],
      }),
    );
    await iam.addRoleToInstanceProfile(
      new AddRoleToInstanceProfileCommand({
        InstanceProfileName: "Web",
        RoleName: "WebServer",
      }),
    );
    const { InstanceProfile } = await iam.getInstanceProfile(
      new GetInstanceProfileCommand({ InstanceProfileName: "Web" }),
    );

    // Then IAM describes the profile, its tags and the Role it holds
    assertIdentical(
      created.InstanceProfile.Arn,
      `arn:aws:iam::${iam.accountId}:instance-profile/fleet/Web`,
    );
    assertStringStartsWith(InstanceProfile.InstanceProfileId, "AIPA");
    assertArrayEquals(created.InstanceProfile.Roles, []);
    assertArrayEquals(
      InstanceProfile.Roles.map((role) => role.RoleName),
      ["WebServer"],
    );
    assertArrayEquals(InstanceProfile.Tags ?? [], [
      { Key: "team", Value: "web" },
    ]);
  });

  it("lists instance profiles under a path, and those holding a Role", async () => {
    // Given three instance profiles, one under /fleet/ holding a Role
    const iam = await withRoles("WebServer");
    await Promise.all(
      [
        ["Web", "/fleet/"],
        ["Batch", "/"],
        ["Spare", "/fleet/"],
      ].map(async ([InstanceProfileName, Path]) =>
        iam.createInstanceProfile(
          new CreateInstanceProfileCommand({ InstanceProfileName, Path }),
        ),
      ),
    );
    await iam.addRoleToInstanceProfile(
      new AddRoleToInstanceProfileCommand({
        InstanceProfileName: "Web",
        RoleName: "WebServer",
      }),
    );

    // When the profiles under /fleet/, a page of one, and the Role's are listed
    const fleet = await iam.listInstanceProfiles(
      new ListInstanceProfilesCommand({ PathPrefix: "/fleet/" }),
    );
    const page = await iam.listInstanceProfiles(
      new ListInstanceProfilesCommand({ MaxItems: 1 }),
    );
    const forRole = await iam.listInstanceProfilesForRole(
      new ListInstanceProfilesForRoleCommand({ RoleName: "WebServer" }),
    );

    // Then each answers in name order
    assertArrayEquals(
      fleet.InstanceProfiles.map((each) => each.InstanceProfileName),
      ["Spare", "Web"],
    );
    assertArrayEquals(
      page.InstanceProfiles.map((each) => each.InstanceProfileName),
      ["Batch"],
    );
    assertTrue(page.IsTruncated);
    assertArrayEquals(
      forRole.InstanceProfiles.map((each) => each.InstanceProfileName),
      ["Web"],
    );
  });

  it("holds one Role at most", async () => {
    // Given an instance profile holding a Role
    const iam = await withRoles("First", "Second");
    await iam.createInstanceProfile(
      new CreateInstanceProfileCommand({ InstanceProfileName: "Web" }),
    );
    await iam.addRoleToInstanceProfile(
      new AddRoleToInstanceProfileCommand({
        InstanceProfileName: "Web",
        RoleName: "First",
      }),
    );

    // When a second Role is added
    const error = await assertThrowsErrorAsync(async () =>
      iam.addRoleToInstanceProfile(
        new AddRoleToInstanceProfileCommand({
          InstanceProfileName: "Web",
          RoleName: "Second",
        }),
      ),
    );

    // Then IAM refuses it
    assertInstanceOf(error, SimIamLimitExceeded);
    assertIdentical(
      error.message,
      "Cannot exceed quota for InstanceSessionsPerInstanceProfile: 1",
    );
  });

  it("refuses to delete a Role or an instance profile while one holds the other", async () => {
    // Given an instance profile holding a Role
    const iam = await withRoles("WebServer");
    await iam.createInstanceProfile(
      new CreateInstanceProfileCommand({ InstanceProfileName: "Web" }),
    );
    await iam.addRoleToInstanceProfile(
      new AddRoleToInstanceProfileCommand({
        InstanceProfileName: "Web",
        RoleName: "WebServer",
      }),
    );

    // When the Role and the profile are deleted, then the Role is taken out
    // and both deleted
    const role = await assertThrowsErrorAsync(async () =>
      iam.deleteRole(new DeleteRoleCommand({ RoleName: "WebServer" })),
    );
    const profile = await assertThrowsErrorAsync(async () =>
      iam.deleteInstanceProfile(
        new DeleteInstanceProfileCommand({ InstanceProfileName: "Web" }),
      ),
    );
    await iam.removeRoleFromInstanceProfile(
      new RemoveRoleFromInstanceProfileCommand({
        InstanceProfileName: "Web",
        RoleName: "WebServer",
      }),
    );
    await iam.deleteInstanceProfile(
      new DeleteInstanceProfileCommand({ InstanceProfileName: "Web" }),
    );
    await iam.deleteRole(new DeleteRoleCommand({ RoleName: "WebServer" }));

    // Then the first two deletions were refused, and the rest left nothing
    assertInstanceOf(role, SimIamDeleteConflict);
    assertInstanceOf(profile, SimIamDeleteConflict);
    assertIdentical(
      role.message,
      "Cannot delete entity, must remove roles from instance profile first.",
    );
    assertMapSize(iam.instanceProfiles, 0);
    assertMapSize(iam.roles, 0);
  });

  it("needs iam:PassRole on the Role being added", async () => {
    // Given a caller allowed everything except passing a Role
    const iam = await withRoles("WebServer");
    const caller = await iam.makeDeployRole({
      roleName: "deployer",
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          { Effect: "Allow", Action: "*", Resource: "*" },
          { Effect: "Deny", Action: "iam:PassRole", Resource: "*" },
        ],
      },
    });
    await iam.createInstanceProfile(
      new CreateInstanceProfileCommand({ InstanceProfileName: "Web" }),
    );

    // When it adds the Role to an instance profile
    const error = await assertThrowsErrorAsync(async () =>
      iam.addRoleToInstanceProfile(
        new AddRoleToInstanceProfileCommand({
          InstanceProfileName: "Web",
          RoleName: "WebServer",
        }),
        { caller },
      ),
    );

    // Then IAM refuses it, and the profile stays empty
    assertInstanceOf(error, SimIamAccessDenied);
    assertUndefined(
      iam.instanceProfiles.get("Web" as SimIamInstanceProfileName)?.roleName,
    );
  });

  it("refuses names IAM refuses, and names it already holds in any case", async () => {
    // Given an instance profile named Web
    const iam = await withRoles("WebServer");
    await iam.createInstanceProfile(
      new CreateInstanceProfileCommand({ InstanceProfileName: "Web" }),
    );
    const create = (InstanceProfileName: string) =>
      assertThrowsErrorAsync(async () =>
        iam.createInstanceProfile(
          new CreateInstanceProfileCommand({ InstanceProfileName }),
        ),
      );

    // When profiles named web, "web server" and 129 characters are created
    const taken = await create("web");
    const spaced = await create("web server");
    const long = await create("p".repeat(129));

    // Then IAM refuses each
    assertInstanceOf(taken, SimIamEntityAlreadyExists);
    assertIdentical(taken.message, "Instance Profile web already exists.");
    assertInstanceOf(spaced, SimIamValidationError);
    assertInstanceOf(long, SimIamValidationError);
  });

  it("refuses an instance profile, a Role or a membership it does not hold", async () => {
    // Given an empty instance profile and a Role
    const iam = await withRoles("WebServer");
    await iam.createInstanceProfile(
      new CreateInstanceProfileCommand({ InstanceProfileName: "Web" }),
    );

    // When a missing profile is read, a missing Role added, a Role not in the
    // profile removed and the profiles of a missing Role listed
    const profile = await assertThrowsErrorAsync(async () =>
      iam.getInstanceProfile(
        new GetInstanceProfileCommand({ InstanceProfileName: "Missing" }),
      ),
    );
    const role = await assertThrowsErrorAsync(async () =>
      iam.addRoleToInstanceProfile(
        new AddRoleToInstanceProfileCommand({
          InstanceProfileName: "Web",
          RoleName: "Missing",
        }),
      ),
    );
    const membership = await assertThrowsErrorAsync(async () =>
      iam.removeRoleFromInstanceProfile(
        new RemoveRoleFromInstanceProfileCommand({
          InstanceProfileName: "Web",
          RoleName: "WebServer",
        }),
      ),
    );
    const listing = await assertThrowsErrorAsync(async () =>
      iam.listInstanceProfilesForRole(
        new ListInstanceProfilesForRoleCommand({ RoleName: "Missing" }),
      ),
    );

    // Then IAM finds none of them
    assertArrayLength(
      [profile, role, membership, listing].filter(
        (error) => error instanceof SimIamNoSuchEntity,
      ),
      4,
    );
    assertIdentical(
      profile.message,
      "Instance Profile Missing cannot be found.",
    );
  });
});
