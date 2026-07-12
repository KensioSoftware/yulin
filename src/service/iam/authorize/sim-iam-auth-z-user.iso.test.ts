import { CreateUserCommand } from "@aws-sdk/client-iam";
import { assertNonNullable, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimAws } from "../../aws/sim-aws.js";

describe("Sim IAM User authorization", () => {
  it("allows an IAM User through a matching resource-policy principal", async () => {
    // Given an IAM User and a resource policy granting access to its ARN.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const createUserOutput = await simIam.createUser(
      new CreateUserCommand({
        UserName: "ResourcePolicyUser",
      }),
    );
    const userArn = createUserOutput.User.Arn;
    assertNonNullable(userArn);

    // When the User requests the resource allowed by the policy.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "arn",
        arn: userArn,
      },
      resourcePolicies: [
        {
          document: {
            Version: "2012-10-17",
            Statement: {
              Effect: "Allow",
              Principal: {
                AWS: userArn,
              },
              Action: "s3:GetObject",
              Resource: "arn:aws:s3:::example-bucket/*",
            },
          },
        },
      ],
    });

    // Then the resource policy authorizes the User.
    assertTrue(decision.isAllowed);
  });

  it("supplies an IAM User ARN as aws:PrincipalArn", async () => {
    // Given an IAM User and a resource policy conditioned on its principal ARN.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const createUserOutput = await simIam.createUser(
      new CreateUserCommand({
        UserName: "ConditionalUser",
        Path: "/application/",
      }),
    );
    const userArn = createUserOutput.User.Arn;
    assertNonNullable(userArn);

    // When the User requests the resource without supplying condition context.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "arn",
        arn: userArn,
      },
      resourcePolicies: [
        {
          document: {
            Version: "2012-10-17",
            Statement: {
              Effect: "Allow",
              Principal: "*",
              Action: "s3:GetObject",
              Resource: "arn:aws:s3:::example-bucket/*",
              Condition: {
                StringEquals: {
                  "aws:PrincipalArn": userArn,
                },
              },
            },
          },
        },
      ],
    });

    // Then IAM derives aws:PrincipalArn from the User caller.
    assertTrue(decision.isAllowed);
  });

  it("denies an IAM User when aws:PrincipalArn does not match", async () => {
    // Given an IAM User and a policy conditioned on another User's ARN.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const createUserOutput = await simIam.createUser(
      new CreateUserCommand({
        UserName: "DifferentConditionalUser",
      }),
    );
    const userArn = createUserOutput.User.Arn;
    assertNonNullable(userArn);

    // When the User requests the otherwise allowed resource.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::example-bucket/example-key.txt",
      caller: {
        kind: "arn",
        arn: userArn,
      },
      resourcePolicies: [
        {
          document: {
            Version: "2012-10-17",
            Statement: {
              Effect: "Allow",
              Principal: "*",
              Action: "s3:GetObject",
              Resource: "arn:aws:s3:::example-bucket/*",
              Condition: {
                StringEquals: {
                  "aws:PrincipalArn": `arn:aws:iam::${accountId}:user/AnotherUser`,
                },
              },
            },
          },
        },
      ],
    });

    // Then the mismatched principal condition leaves the request denied.
    assertTrue(decision.isImplicitDeny);
  });
});
