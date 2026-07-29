import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  DescribeParametersCommand,
  GetParametersByPathCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";
import {
  assertArrayEquals,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";

const accountIdOneOnes = "111111111111" as SimAwsAccountId;

describe("SSM path and batch IAM authorization", () => {
  it("authorizes a path listing against the path itself", async () => {
    // Given a Role allowed on a path but explicitly denied one parameter
    // under it.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const regionName = simAws.defaultRegionName;
    const parameterArn = `arn:aws:ssm:${regionName}:${accountIdOneOnes}:parameter/myapp/prod/db-host`;
    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "ParameterReader",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${accountIdOneOnes}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ParameterReader",
        PolicyName: "ParameterPolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: [
            {
              Effect: "Allow",
              Action: "ssm:GetParametersByPath",
              Resource: `arn:aws:ssm:${regionName}:${accountIdOneOnes}:parameter/myapp`,
            },
            {
              Effect: "Deny",
              Action: "ssm:GetParametersByPath",
              Resource: parameterArn,
            },
          ],
        }),
      }),
    );
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/db-host",
        Type: "String",
        Value: "db.internal",
      }),
    );

    // When it lists the path recursively.
    const listed = await simAws.ssm().getParametersByPath(
      new GetParametersByPathCommand({
        Path: "/myapp",
        Recursive: true,
      }),
      { caller: { kind: "arn", arn: role.Role.Arn } },
    );

    // Then the denied parameter still comes back, because access to a path is
    // access to everything under it on real Parameter Store.
    assertArrayEquals(
      listed.Parameters?.map((parameter) => parameter.Name),
      ["/myapp/prod/db-host"],
    );
  });

  it("denies a path listing the caller's policy does not reach", async () => {
    // Given a Role allowed on a different path.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const regionName = simAws.defaultRegionName;
    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "ParameterReader",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${accountIdOneOnes}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ParameterReader",
        PolicyName: "ParameterPolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "ssm:GetParametersByPath",
            Resource: `arn:aws:ssm:${regionName}:${accountIdOneOnes}:parameter/other`,
          },
        }),
      }),
    );
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/db-host",
        Type: "String",
        Value: "db.internal",
      }),
    );

    // When it lists a path the policy does not name.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .getParametersByPath(
          new GetParametersByPathCommand({ Path: "/myapp", Recursive: true }),
          { caller: { kind: "arn", arn: role.Role.Arn } },
        ),
    );

    // Then it is denied.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("denies DescribeParameters to a policy naming parameter ARNs", async () => {
    // Given a Role allowed to describe, but only against parameter ARNs.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "ParameterReader",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${accountIdOneOnes}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ParameterReader",
        PolicyName: "ParameterPolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "ssm:DescribeParameters",
            Resource: `arn:aws:ssm:${simAws.defaultRegionName}:${accountIdOneOnes}:parameter/myapp/*`,
          },
        }),
      }),
    );
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/db-host",
        Type: "String",
        Value: "db.internal",
      }),
    );

    // When it describes the parameters.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().describeParameters(new DescribeParametersCommand({}), {
        caller: { kind: "arn", arn: role.Role.Arn },
      }),
    );

    // Then it is denied, because real Parameter Store gives this action no
    // resource-level permissions and it has to be allowed on `*`.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("allows DescribeParameters to a policy allowing it on everything", async () => {
    // Given a Role allowed to describe on `*`.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "ParameterReader",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${accountIdOneOnes}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ParameterReader",
        PolicyName: "ParameterPolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "ssm:DescribeParameters", Resource: "*" },
        }),
      }),
    );
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/db-host",
        Type: "String",
        Value: "db.internal",
      }),
    );

    // When it describes the parameters.
    const described = await simAws
      .ssm()
      .describeParameters(new DescribeParametersCommand({}), {
        caller: { kind: "arn", arn: role.Role.Arn },
      });

    // Then the listing succeeds.
    assertArrayEquals(
      described.Parameters?.map((parameter) => parameter.Name),
      ["/myapp/prod/db-host"],
    );
  });
});
