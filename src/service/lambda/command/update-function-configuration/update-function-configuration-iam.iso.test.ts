import {
  CreateFunctionCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";

async function createOrdersFunction(
  simAws: SimAws,
  accountId: string,
): Promise<void> {
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "orders",
      Role: `arn:aws:iam::${accountId}:role/ExecutionRole`,
      Code: { ZipFile: makeLambdaZipFileInput(() => "first") },
    }),
  );
}

async function createRole(
  simAws: SimAws,
  accountId: string,
  roleName: string,
): Promise<string> {
  const roleCreation = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  return roleCreation.Role.Arn;
}

describe("Lambda UpdateFunctionConfigurationCommand IAM authorization", () => {
  it("allows a Role whose policy permits lambda:UpdateFunctionConfiguration", async () => {
    // Given a Role allowed to update one function's code.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    await createOrdersFunction(simAws, accountId);
    const roleArn = await createRole(simAws, accountId, "SettingsDeployer");

    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "SettingsDeployer",
        PolicyName: "UpdateOrdersSettings",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "lambda:UpdateFunctionConfiguration",
            Resource:
              `arn:aws:lambda:${simAws.defaultRegionName}:` +
              `${accountId}:function:orders`,
          },
        }),
      }),
    );

    // When that Role changes the function's settings.
    const updated = await simAws.lambda().updateFunctionConfiguration(
      new UpdateFunctionConfigurationCommand({
        FunctionName: "orders",
        Timeout: 5,
      }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then IAM allows it.
    assertIdentical(updated.FunctionName, "orders");

    await simAws.backgroundTasksComplete();
  });

  it("implicitly denies a Role with no matching policy", async () => {
    // Given a Role with no Lambda permissions.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    await createOrdersFunction(simAws, accountId);
    const roleArn = await createRole(simAws, accountId, "NoPermissionsRole");

    // When that Role changes the function's settings.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().updateFunctionConfiguration(
        new UpdateFunctionConfigurationCommand({
          FunctionName: "orders",
          Timeout: 5,
        }),
        { caller: { kind: "arn", arn: roleArn } },
      ),
    );

    // Then IAM implicitly denies it.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:UpdateFunctionConfiguration");

    await simAws.backgroundTasksComplete();
  });
});
