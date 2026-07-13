import {
  CreateUserCommand,
  ListPoliciesCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import {
  SimIamMalformedPolicyDocument,
  SimIamNoSuchEntity,
} from "../../../error/sim-iam.error.js";

describe("IAM PutUserPolicyCommand", () => {
  it("adds an inline identity policy to a User", async () => {
    // Given an IAM User exists.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const createUserOutput = await simIam.createUser(
      new CreateUserCommand({
        UserName: "ApplicationUser",
      }),
    );

    // When an inline identity policy is added to the User.
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "ApplicationUser",
        PolicyName: "ReadObjects",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::example-bucket/*",
          },
        }),
      }),
    );

    const decision = simIam.authorize({
      caller: {
        kind: "arn",
        arn: createUserOutput.User.Arn,
      },
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/object.txt",
    });

    // Then the inline policy grants access.
    assertTrue(decision.isAllowed);
    assertIdentical(decision.value, "Allow");

    // And the inline policy is not exposed as a managed policy.
    const listOutput = await simIam.listPolicies(new ListPoliciesCommand({}));
    assertArrayLength(listOutput.Policies, 0);
  });

  it("replaces an existing inline User policy with the same name", async () => {
    // Given a User with an allowing inline policy.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const createUserOutput = await simIam.createUser(
      new CreateUserCommand({
        UserName: "ApplicationUser",
      }),
    );

    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "ApplicationUser",
        PolicyName: "ObjectAccess",
        PolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::example-bucket/*",
          },
        }),
      }),
    );

    // When a policy with the same name replaces it.
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "ApplicationUser",
        PolicyName: "ObjectAccess",
        PolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Deny",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::example-bucket/*",
          },
        }),
      }),
    );

    const decision = simIam.authorize({
      caller: {
        kind: "arn",
        arn: createUserOutput.User.Arn,
      },
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/object.txt",
    });

    // Then only the replacement policy applies.
    assertTrue(decision.isExplicitDeny);
  });

  it("throws when the IAM User does not exist", async () => {
    const simIam = new SimAws().iam();

    const error = await assertThrowsErrorAsync(async () =>
      simIam.putUserPolicy(
        new PutUserPolicyCommand({
          UserName: "MissingUser",
          PolicyName: "ObjectAccess",
          PolicyDocument: JSON.stringify({
            Statement: {
              Effect: "Allow",
              Action: "s3:GetObject",
              Resource: "*",
            },
          }),
        }),
      ),
    );

    assertInstanceOf(error, SimIamNoSuchEntity);
    assertIdentical(error.message, "No IAM User with name MissingUser");
  });

  it("rejects a malformed inline policy document", async () => {
    const simIam = new SimAws().iam();
    await simIam.createUser(
      new CreateUserCommand({
        UserName: "ApplicationUser",
      }),
    );

    const error = await assertThrowsErrorAsync(async () =>
      simIam.putUserPolicy(
        new PutUserPolicyCommand({
          UserName: "ApplicationUser",
          PolicyName: "InvalidPolicy",
          PolicyDocument: JSON.stringify({
            Statement: {
              Effect: "Allow",
              Resource: "*",
            },
          }),
        }),
      ),
    );

    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertIdentical(
      error.message,
      "IAM policy statement must define either Action or NotAction",
    );
  });
});
