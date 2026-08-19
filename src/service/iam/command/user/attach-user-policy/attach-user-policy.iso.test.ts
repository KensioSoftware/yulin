import {
  AttachUserPolicyCommand,
  CreatePolicyCommand,
  CreateUserCommand,
} from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { makeSimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";

describe("IAM AttachUserPolicyCommand", () => {
  it("grants a User the permissions of an attached Managed Policy", async () => {
    // Given a User and a Managed Policy allowing an action.
    const simAws = new SimAws();
    const simIam = simAws.account(makeSimAwsAccountId()).iam();
    const userCreation = await simIam.createUser(
      new CreateUserCommand({ UserName: "ApplicationUser" }),
    );
    const policyCreation = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "ReadAssets",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::assets-bucket/*",
          },
        }),
      }),
    );

    // When the Managed Policy is attached to the User.
    await simIam.attachUserPolicy(
      new AttachUserPolicyCommand({
        UserName: "ApplicationUser",
        PolicyArn: policyCreation.Policy.Arn,
      }),
    );

    // Then the User is allowed the action the Policy names.
    const decision = simIam.authorize({
      caller: { kind: "arn", arn: userCreation.User.Arn },
      action: "s3:GetObject",
      resource: "arn:aws:s3:::assets-bucket/logo.svg",
    });

    assertTrue(decision.isAllowed);
  });

  it("attaches a Policy ARN with no stored Policy behind it", async () => {
    // Given a User and an AWS-managed Policy ARN the simulation does not hold.
    const simAws = new SimAws();
    const simIam = simAws.account(makeSimAwsAccountId()).iam();
    const userCreation = await simIam.createUser(
      new CreateUserCommand({ UserName: "ApplicationUser" }),
    );

    // When that ARN is attached to the User.
    await simIam.attachUserPolicy(
      new AttachUserPolicyCommand({
        UserName: "ApplicationUser",
        PolicyArn: "arn:aws:iam::aws:policy/ReadOnlyAccess",
      }),
    );

    // Then the attachment is recorded and contributes no statements.
    const user = simIam.users.get("ApplicationUser" as never);

    assertTrue(
      user?.attachedPolicyArns.has("arn:aws:iam::aws:policy/ReadOnlyAccess"),
    );

    const decision = simIam.authorize({
      caller: { kind: "arn", arn: userCreation.User.Arn },
      action: "s3:GetObject",
      resource: "arn:aws:s3:::assets-bucket/logo.svg",
    });

    assertTrue(decision.isImplicitDeny);
  });

  it("throws when the IAM User does not exist", async () => {
    const simAws = new SimAws();
    const simIam = simAws.iam();

    const error = await assertThrowsErrorAsync(async () =>
      simIam.attachUserPolicy(
        new AttachUserPolicyCommand({
          UserName: "MissingUser",
          PolicyArn: "arn:aws:iam::aws:policy/ReadOnlyAccess",
        }),
      ),
    );

    assertInstanceOf(error, SimIamNoSuchEntity);
    assertIdentical(error.message, "No IAM User with name MissingUser");
  });

  it("requires a UserName and a PolicyArn", async () => {
    const simAws = new SimAws();
    const simIam = simAws.iam();
    await simIam.createUser(new CreateUserCommand({ UserName: "SomeUser" }));

    const missingUsername = await assertThrowsErrorAsync(async () =>
      simIam.attachUserPolicy(
        new AttachUserPolicyCommand({
          UserName: undefined,
          PolicyArn: "arn:aws:iam::aws:policy/ReadOnlyAccess",
        }),
      ),
    );

    assertIdentical(missingUsername.message, "UserName is required");

    const missingPolicyArn = await assertThrowsErrorAsync(async () =>
      simIam.attachUserPolicy(
        new AttachUserPolicyCommand({
          UserName: "SomeUser",
          PolicyArn: undefined,
        }),
      ),
    );

    assertIdentical(missingPolicyArn.message, "PolicyArn is required");
  });
});
