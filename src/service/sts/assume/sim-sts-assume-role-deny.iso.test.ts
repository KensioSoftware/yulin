import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  assertIdentical,
  assertInstanceOf,
  assertObjectMatches,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { AssumeRoleTrustPolicyAuthorizer } from "../auth-z/assume-role-trust-policy-authorizer.js";

describe("STS AssumeRole denial", () => {
  it("denies Account root when the target Role does not trust it", async () => {
    // Given a target Role whose trust policy allows only another principal.
    const accountId = makeSimAwsAccountId();
    const targetRoleArn = `arn:aws:iam::${accountId}:role/TargetRole`;
    const simAws = new SimAws({ defaultAccountId: accountId });
    await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "TargetRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${accountId}:role/AnotherRole`,
            },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    // When Account root principal tries to assume the Role.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.sts().assumeRole(
          new AssumeRoleCommand({
            RoleArn: targetRoleArn,
            RoleSessionName: "untrusted-session",
          }),
        ),
    );

    // Then the target Role trust policy denies the request.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "sts:AssumeRole");
    assertIdentical(error.resource, targetRoleArn);
  });

  it("denies a Role without an identity policy allowing AssumeRole", async () => {
    // Given a target Role trusts a source Role that has no AssumeRole permission.
    const accountId = makeSimAwsAccountId();
    const targetRoleArn = `arn:aws:iam::${accountId}:role/TargetRole`;
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const sourceRoleName = "SourceRole";
    const sourceRoleArn = `arn:aws:iam::${accountId}:role/${sourceRoleName}`;

    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: sourceRoleName,
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${accountId}:root`,
            },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "TargetRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: sourceRoleArn,
            },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    // When the source Role attempts to assume the trusted target Role.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.sts().assumeRole(
        new AssumeRoleCommand({
          RoleArn: targetRoleArn,
          RoleSessionName: "missing-identity-allow",
        }),
        {
          caller: { kind: "arn", arn: sourceRoleArn },
        },
      ),
    );

    // Then source-account identity authorization denies the request.
    assertInstanceOf(error, SimIamAccessDenied);
    assertObjectMatches(error, {
      caller: { kind: "arn", arn: sourceRoleArn },
      resource: targetRoleArn,
    });
  });

  it("denies cross-account access when the target Role does not trust the source", async () => {
    // Given a source Role permitted to assume a target Role that trusts another Account.
    const sourceAccountId = makeSimAwsAccountId();
    const targetAccountId = makeSimAwsAccountId();
    const trustedAccountId = makeSimAwsAccountId();
    const sourceRoleName = "SourceRole";
    const sourceRoleArn = `arn:aws:iam::${sourceAccountId}:role/${sourceRoleName}`;
    const targetRoleArn = `arn:aws:iam::${targetAccountId}:role/TargetRole`;
    const simAws = new SimAws({ defaultAccountId: sourceAccountId });

    await simAws
      .account(sourceAccountId)
      .iam()
      .createRole(
        new CreateRoleCommand({
          RoleName: sourceRoleName,
          AssumeRolePolicyDocument: JSON.stringify({
            Statement: {
              Effect: "Allow",
              Principal: {
                AWS: `arn:aws:iam::${sourceAccountId}:root`,
              },
              Action: "sts:AssumeRole",
            },
          }),
        }),
      );
    await simAws
      .account(sourceAccountId)
      .iam()
      .putRolePolicy(
        new PutRolePolicyCommand({
          RoleName: sourceRoleName,
          PolicyName: "AssumeCrossAccountRole",
          PolicyDocument: JSON.stringify({
            Statement: {
              Effect: "Allow",
              Action: "sts:AssumeRole",
              Resource: targetRoleArn,
            },
          }),
        }),
      );
    await simAws
      .account(targetAccountId)
      .iam()
      .createRole(
        new CreateRoleCommand({
          RoleName: "TargetRole",
          AssumeRolePolicyDocument: JSON.stringify({
            Statement: {
              Effect: "Allow",
              Principal: {
                AWS: `arn:aws:iam::${trustedAccountId}:root`,
              },
              Action: "sts:AssumeRole",
            },
          }),
        }),
      );

    // When the permitted source Role attempts to assume the untrusted target Role.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .account(sourceAccountId)
        .sts()
        .assumeRole(
          new AssumeRoleCommand({
            RoleArn: targetRoleArn,
            RoleSessionName: "untrusted-cross-account-session",
          }),
          {
            caller: { kind: "arn", arn: sourceRoleArn },
          },
        ),
    );

    // Then the target Account's trust authorization denies the request.
    assertInstanceOf(error, SimIamAccessDenied);
    assertObjectMatches(error, {
      caller: { kind: "arn", arn: sourceRoleArn },
      resource: targetRoleArn,
    });
    assertIdentical(
      error.message,
      `User: ${sourceRoleArn} is not authorized to perform: sts:AssumeRole on resource: ${targetRoleArn}`,
    );
  });

  it("denies an anonymous caller before Role authorization", async () => {
    // Given an anonymous caller attempting to assume a Role.
    const accountId = makeSimAwsAccountId();
    const targetRoleArn = `arn:aws:iam::${accountId}:role/TargetRole`;
    const simAws = new SimAws({ defaultAccountId: accountId });

    // When the anonymous caller sends an AssumeRole request through STS.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.sts().assumeRole(
        new AssumeRoleCommand({
          RoleArn: targetRoleArn,
          RoleSessionName: "anonymous-session",
        }),
        {
          caller: { kind: "anonymous" },
        },
      ),
    );

    // Then STS returns an IAM access-denied error for the anonymous principal.
    assertInstanceOf(error, SimIamAccessDenied);
    assertObjectMatches(error, {
      caller: { kind: "anonymous" },
      action: "sts:AssumeRole",
      resource: targetRoleArn,
    });
    assertIdentical(
      error.message,
      `User: anonymous is not authorized to perform: sts:AssumeRole on resource: ${targetRoleArn}`,
    );
  });

  it("denies an AWS service principal that cannot assume a Role", async () => {
    // Given an AWS service principal attempting to assume a Role.
    const accountId = makeSimAwsAccountId();
    const targetRoleArn = `arn:aws:iam::${accountId}:role/LambdaExecutionRole`;
    const simAws = new SimAws({ defaultAccountId: accountId });

    // When the service principal sends an AssumeRole request through STS.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.sts().assumeRole(
        new AssumeRoleCommand({
          RoleArn: targetRoleArn,
          RoleSessionName: "lambda-session",
        }),
        {
          caller: {
            kind: "service",
            service: "lambda.amazonaws.com",
          },
        },
      ),
    );

    // Then STS identifies the service principal in its access-denied response.
    assertInstanceOf(error, SimIamAccessDenied);
    assertObjectMatches(error, {
      caller: {
        kind: "service",
        service: "lambda.amazonaws.com",
      },
      action: "sts:AssumeRole",
      resource: targetRoleArn,
    });
    assertIdentical(
      error.message,
      `User: lambda.amazonaws.com is not authorized to perform: sts:AssumeRole on resource: ${targetRoleArn}`,
    );
  });

  it("throws AccessDenied when the target Role has no trust policy", async () => {
    const accountId = makeSimAwsAccountId();
    const targetRoleArn = `arn:aws:iam::${accountId}:role/TargetRole`;
    const caller = {
      kind: "arn" as const,
      arn: `arn:aws:iam::${accountId}:root`,
    };
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "TargetRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Principal: { AWS: caller.arn },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    const role = {
      ...createRoleOutput.Role,
      AssumeRolePolicyDocument: undefined,
    };

    const error = assertThrowsError(() => {
      const assumeRoleTrustPolicyAuthorizer =
        new AssumeRoleTrustPolicyAuthorizer();
      assumeRoleTrustPolicyAuthorizer.authorize({
        roleArn: targetRoleArn,
        // @ts-expect-error TS2322 -- testing invalid role
        role,
        targetIam: simIam,
        caller,
      });
    });

    assertInstanceOf(error, SimIamAccessDenied);
    assertObjectMatches(error, {
      caller,
      action: "sts:AssumeRole",
      resource: targetRoleArn,
    });
    assertIdentical(
      error.message,
      `User: ${caller.arn} is not authorized to perform: sts:AssumeRole on resource: ${targetRoleArn}`,
    );
  });
});
