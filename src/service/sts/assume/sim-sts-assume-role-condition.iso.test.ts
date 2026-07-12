import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  assertIdentical,
  assertInstanceOf,
  assertObjectMatches,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";

describe("STS AssumeRole policy conditions", () => {
  it("denies an ExternalId that does not satisfy the Role trust policy", async () => {
    // Given a target Role whose trust policy requires a specific ExternalId.
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
              AWS: `arn:aws:iam::${accountId}:root`,
            },
            Action: "sts:AssumeRole",
            Condition: {
              StringEquals: {
                "sts:ExternalId": "expected-external-id",
              },
            },
          },
        }),
      }),
    );

    // When Account root supplies a different ExternalId.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.sts().assumeRole(
        new AssumeRoleCommand({
          RoleArn: targetRoleArn,
          RoleSessionName: "incorrect-external-id",
          ExternalId: "different-external-id",
        }),
      ),
    );

    // Then the target Role trust-policy condition denies the request.
    assertInstanceOf(error, SimIamAccessDenied);
    assertObjectMatches(error, {
      action: "sts:AssumeRole",
      resource: targetRoleArn,
    });
  });

  it("supports StringLike ExternalId conditions in the Role trust policy", async () => {
    // Given a target Role that trusts ExternalIds matching a tenant prefix.
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
              AWS: `arn:aws:iam::${accountId}:root`,
            },
            Action: "sts:AssumeRole",
            Condition: {
              StringLike: {
                "sts:ExternalId": "tenant-123-*",
              },
            },
          },
        }),
      }),
    );

    // When Account root supplies an ExternalId matching the trusted pattern.
    const output = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: targetRoleArn,
        RoleSessionName: "matching-external-id",
        ExternalId: "tenant-123-deployment",
      }),
    );

    // Then the trust-policy condition permits the Role session.
    assertIdentical(
      output.AssumedRoleUser?.Arn,
      `arn:aws:sts::${accountId}:assumed-role/TargetRole/matching-external-id`,
    );
  });

  it("applies aws:PrincipalArn conditions in the source identity policy", async () => {
    // Given a source Role whose AssumeRole permission requires a different principal.
    const sourceAccountId = makeSimAwsAccountId();
    const targetAccountId = makeSimAwsAccountId();
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
            Version: "2012-10-17",
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
          PolicyName: "ConditionalAssumeRole",
          PolicyDocument: JSON.stringify({
            Version: "2012-10-17",
            Statement: {
              Effect: "Allow",
              Action: "sts:AssumeRole",
              Resource: targetRoleArn,
              Condition: {
                StringEquals: {
                  "aws:PrincipalArn": `arn:aws:iam::${sourceAccountId}:role/DifferentRole`,
                },
              },
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
            Version: "2012-10-17",
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

    // When the source Role attempts the otherwise trusted cross-account assumption.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .account(sourceAccountId)
        .sts()
        .assumeRole(
          new AssumeRoleCommand({
            RoleArn: targetRoleArn,
            RoleSessionName: "identity-condition-mismatch",
          }),
          {
            caller: { kind: "arn", arn: sourceRoleArn },
          },
        ),
    );

    // Then the source identity-policy condition denies the request.
    assertInstanceOf(error, SimIamAccessDenied);
    assertObjectMatches(error, {
      caller: { kind: "arn", arn: sourceRoleArn },
      resource: targetRoleArn,
    });
  });
});
