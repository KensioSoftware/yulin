import { CreateRoleCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  assertIdentical,
  assertInstanceOf,
  assertObjectMatches,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";

describe("STS AssumeRole in the same sim Account", () => {
  it("allows Account root when the target Role does not trust it", async () => {
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
});
