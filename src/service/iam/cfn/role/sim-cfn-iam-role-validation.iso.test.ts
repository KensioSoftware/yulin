import { assertInstanceOf, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

const assumeRolePolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: {
        Service: "lambda.amazonaws.com",
      },
      Action: "sts:AssumeRole",
    },
  ],
};

async function deployRole(
  properties: SimCfnTemplateValueRecord,
): Promise<void> {
  const simAws = new SimAws();

  await simAws.cloudFormation().deployTemplate({
    stackName: "iam-role-validation-stack",
    template: {
      Resources: {
        InvalidRole: {
          Type: "AWS::IAM::Role",
          Properties: properties,
        },
      },
    },
  });
}

describe("IAM CloudFormation Role validation", () => {
  it("requires an AssumeRolePolicyDocument", async () => {
    const error = await assertThrowsErrorAsync(async () =>
      deployRole({ RoleName: "InvalidRole" }),
    );

    assertInstanceOf(error, TypeError);
  });

  it("rejects a non-string RoleName", async () => {
    const error = await assertThrowsErrorAsync(async () =>
      deployRole({
        RoleName: 42,
        AssumeRolePolicyDocument: assumeRolePolicyDocument,
      }),
    );

    assertInstanceOf(error, TypeError);
  });

  it("rejects a non-string Path", async () => {
    const error = await assertThrowsErrorAsync(async () =>
      deployRole({
        RoleName: "InvalidRole",
        Path: 42,
        AssumeRolePolicyDocument: assumeRolePolicyDocument,
      }),
    );

    assertInstanceOf(error, TypeError);
  });

  it("rejects a non-string Description", async () => {
    const error = await assertThrowsErrorAsync(async () =>
      deployRole({
        RoleName: "InvalidRole",
        Description: 42,
        AssumeRolePolicyDocument: assumeRolePolicyDocument,
      }),
    );

    assertInstanceOf(error, TypeError);
  });

  it("rejects a non-array Policies", async () => {
    const error = await assertThrowsErrorAsync(async () =>
      deployRole({
        RoleName: "InvalidRole",
        AssumeRolePolicyDocument: assumeRolePolicyDocument,
        Policies: "not-an-array",
      }),
    );

    assertInstanceOf(error, TypeError);
  });

  it("rejects a non-object Policies entry", async () => {
    const error = await assertThrowsErrorAsync(async () =>
      deployRole({
        RoleName: "InvalidRole",
        AssumeRolePolicyDocument: assumeRolePolicyDocument,
        Policies: ["not-an-object"],
      }),
    );

    assertInstanceOf(error, TypeError);
  });

  it("rejects a Policies entry with a non-string PolicyName", async () => {
    const error = await assertThrowsErrorAsync(async () =>
      deployRole({
        RoleName: "InvalidRole",
        AssumeRolePolicyDocument: assumeRolePolicyDocument,
        Policies: [
          {
            PolicyName: 42,
            PolicyDocument: { Version: "2012-10-17" },
          },
        ],
      }),
    );

    assertInstanceOf(error, TypeError);
  });

  it("rejects a Policies entry with a non-object PolicyDocument", async () => {
    const error = await assertThrowsErrorAsync(async () =>
      deployRole({
        RoleName: "InvalidRole",
        AssumeRolePolicyDocument: assumeRolePolicyDocument,
        Policies: [
          {
            PolicyName: "InvalidPolicy",
            PolicyDocument: "not-an-object",
          },
        ],
      }),
    );

    assertInstanceOf(error, TypeError);
  });

  it("rejects a non-array ManagedPolicyArns", async () => {
    const error = await assertThrowsErrorAsync(async () =>
      deployRole({
        RoleName: "InvalidRole",
        AssumeRolePolicyDocument: assumeRolePolicyDocument,
        ManagedPolicyArns: "not-an-array",
      }),
    );

    assertInstanceOf(error, TypeError);
  });

  it("rejects a non-string ManagedPolicyArns entry", async () => {
    const error = await assertThrowsErrorAsync(async () =>
      deployRole({
        RoleName: "InvalidRole",
        AssumeRolePolicyDocument: assumeRolePolicyDocument,
        ManagedPolicyArns: [42],
      }),
    );

    assertInstanceOf(error, TypeError);
  });
});
