import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  DeleteParameterCommand,
  GetParameterCommand,
  GetParametersCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";

const accountIdOneOnes = "111111111111";

describe("SSM IAM authorization", () => {
  it("allows a read the caller's policy permits", async () => {
    // Given a Role allowed to read one parameter by its real ARN.
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
            Action: "ssm:GetParameter",
            Resource: `arn:aws:ssm:${simAws.defaultRegionName}:${accountIdOneOnes}:parameter/myapp/prod/db-host`,
          },
        }),
      }),
    );

    // And the parameter it names.
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/db-host",
        Type: "String",
        Value: "db.internal",
      }),
    );

    // When it reads that parameter.
    const read = await simAws
      .ssm()
      .getParameter(new GetParameterCommand({ Name: "/myapp/prod/db-host" }), {
        caller: { kind: "arn", arn: role.Role.Arn },
      });

    // Then the read succeeds.
    assertIdentical(read.Parameter?.Value, "db.internal");
  });

  it("denies a policy that keeps the name's leading slash in the ARN", async () => {
    // Given a Role whose policy names the parameter the way it is easy to
    // write it: ARN prefix plus the name, slash and all.
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
            Action: "ssm:GetParameter",
            Resource: `arn:aws:ssm:${simAws.defaultRegionName}:${accountIdOneOnes}:parameter//myapp/prod/db-host`,
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

    // When it reads the parameter.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .getParameter(
          new GetParameterCommand({ Name: "/myapp/prod/db-host" }),
          { caller: { kind: "arn", arn: role.Role.Arn } },
        ),
    );

    // Then it is denied here rather than in a deployment, because the real ARN
    // has one slash after `parameter`, not two.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("denies a write the caller's policy does not permit", async () => {
    // Given a Role allowed only to read.
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
          Statement: { Action: "ssm:GetParameter", Resource: "*" },
        }),
      }),
    );

    // When it writes a parameter.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().putParameter(
        new PutParameterCommand({
          Name: "/myapp/prod/db-host",
          Type: "String",
          Value: "db.internal",
        }),
        { caller: { kind: "arn", arn: role.Role.Arn } },
      ),
    );

    // Then it is denied, against the ARN the parameter would have had.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("denies a delete the caller's policy does not permit", async () => {
    // Given a Role allowed only to read.
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
          Statement: { Action: "ssm:GetParameter", Resource: "*" },
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

    // When it deletes the parameter.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .deleteParameter(
          new DeleteParameterCommand({ Name: "/myapp/prod/db-host" }),
          { caller: { kind: "arn", arn: role.Role.Arn } },
        ),
    );

    // Then it is denied.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("denies a batch read where one name is not permitted", async () => {
    // Given a Role allowed to read one parameter of two.
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
            Action: "ssm:GetParameters",
            Resource: `arn:aws:ssm:${simAws.defaultRegionName}:${accountIdOneOnes}:parameter/myapp/prod/db-host`,
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
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/db-port",
        Type: "String",
        Value: "5432",
      }),
    );

    // When it reads both in one batch.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().getParameters(
        new GetParametersCommand({
          Names: ["/myapp/prod/db-host", "/myapp/prod/db-port"],
        }),
        { caller: { kind: "arn", arn: role.Role.Arn } },
      ),
    );

    // Then the whole batch is denied, as it is on real AWS: one unpermitted
    // name fails the request rather than being left out of the results.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("denies a read of a parameter that is not there", async () => {
    // Given a Role with no parameter permissions at all.
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
          Statement: { Action: "s3:GetObject", Resource: "*" },
        }),
      }),
    );

    // When it reads a parameter that does not exist.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .getParameter(new GetParameterCommand({ Name: "/myapp/missing" }), {
          caller: { kind: "arn", arn: role.Role.Arn },
        }),
    );

    // Then it is denied rather than told the parameter is missing, because
    // real IAM evaluates the request before the service sees it.
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
