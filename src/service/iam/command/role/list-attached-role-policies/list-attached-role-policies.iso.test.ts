import {
  AttachRolePolicyCommand,
  CreateRoleCommand,
  ListAttachedRolePoliciesCommand,
} from "@aws-sdk/client-iam";
import {
  assertFalse,
  assertInstanceOf,
  assertArrayEquals,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { faker } from "@faker-js/faker";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";

const trustPolicy = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
});

describe("IAM ListAttachedRolePoliciesCommand", () => {
  it("lists every policy attached to a Role", async () => {
    // Given a Role with a catalogued and an uncatalogued AWS-managed policy
    // attached.
    const simIam = new SimAws().iam();
    const roleName = faker.string.alpha(12);
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: trustPolicy,
      }),
    );
    for (const policyArn of [
      "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      "arn:aws:iam::aws:policy/AmazonMacieFullAccess",
    ]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- attachment order is what is listed.
      await simIam.attachRolePolicy(
        new AttachRolePolicyCommand({
          RoleName: roleName,
          PolicyArn: policyArn,
        }),
      );
    }

    // When the Role's attached policies are listed.
    const output = await simIam.listAttachedRolePolicies(
      new ListAttachedRolePoliciesCommand({ RoleName: roleName }),
    );

    // Then both are listed by name and ARN.
    assertFalse(output.IsTruncated);
    assertArrayEquals(output.AttachedPolicies, [
      {
        PolicyName: "AWSLambdaBasicExecutionRole",
        PolicyArn:
          "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      },
      {
        PolicyName: "AmazonMacieFullAccess",
        PolicyArn: "arn:aws:iam::aws:policy/AmazonMacieFullAccess",
      },
    ]);
  });

  it("narrows the list to a path prefix", async () => {
    // Given a Role with policies on two paths.
    const simIam = new SimAws().iam();
    const roleName = faker.string.alpha(12);
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: trustPolicy,
      }),
    );
    await simIam.attachRolePolicy(
      new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
      }),
    );
    await simIam.attachRolePolicy(
      new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn:
          "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
      }),
    );

    // When the listing asks for the service-role path.
    const output = await simIam.listAttachedRolePolicies(
      new ListAttachedRolePoliciesCommand({
        RoleName: roleName,
        PathPrefix: "/service-role/",
      }),
    );

    // Then only the policy on that path is listed.
    assertArrayEquals(output.AttachedPolicies, [
      {
        PolicyName: "AmazonECSTaskExecutionRolePolicy",
        PolicyArn:
          "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
      },
    ]);
  });

  it("refuses a Role that does not exist", async () => {
    const simIam = new SimAws().iam();

    const error = await assertThrowsErrorAsync(async () =>
      simIam.listAttachedRolePolicies(
        new ListAttachedRolePoliciesCommand({ RoleName: "MissingRole" }),
      ),
    );

    assertInstanceOf(error, SimIamNoSuchEntity);
  });

  it("requires a RoleName", async () => {
    const simIam = new SimAws().iam();

    await assertThrowsErrorAsync(async () =>
      simIam.listAttachedRolePolicies(
        new ListAttachedRolePoliciesCommand({ RoleName: undefined }),
      ),
    );
  });
});
