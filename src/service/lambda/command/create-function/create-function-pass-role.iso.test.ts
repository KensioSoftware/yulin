import { CreateFunctionCommand } from "@aws-sdk/client-lambda";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import type { SimIamPolicyDocumentStatement } from "../../../iam/policy/sim-iam-policy.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";

describe("passing an execution role to Lambda CreateFunction", () => {
  it("refuses a caller denied iam:PassRole on the role it names", async () => {
    // Given a Role allowed everything except passing a Role, which is the
    // shape a scoped deploy Role commonly has.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const creator = await roleAllowed(simAws, accountId, "creator", [
      { Effect: "Allow", Action: "*", Resource: "*" },
      { Effect: "Deny", Action: "iam:PassRole", Resource: "*" },
    ]);

    // When it creates a function naming an execution role.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().createFunction(
        new CreateFunctionCommand({
          FunctionName: "reports",
          Role: `arn:aws:iam::${accountId}:role/JobRole`,
          Code: { ZipFile: makeLambdaZipFileInput(() => null) },
        }),
        { caller: creator },
      ),
    );

    // Then the refusal is about the Role rather than the function, and names
    // the caller that was refused.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "iam:PassRole");
    assertIdentical(error.resource, `arn:aws:iam::${accountId}:role/JobRole`);
    assertStringIncludes(
      error.message,
      `User: arn:aws:iam::${accountId}:role/creator`,
    );

    // And no function was created.
    assertUndefined(simAws.lambda().getSimFunctionByName("reports"));
  });

  it("still refuses a caller allowed only iam:PassRole", async () => {
    // Given a Role that may pass the execution role and nothing else.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const passer = await roleAllowed(simAws, accountId, "passer", [
      { Effect: "Allow", Action: "iam:PassRole", Resource: "*" },
    ]);

    // When it creates a function.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().createFunction(
        new CreateFunctionCommand({
          FunctionName: "reports",
          Role: `arn:aws:iam::${accountId}:role/JobRole`,
          Code: { ZipFile: makeLambdaZipFileInput(() => null) },
        }),
        { caller: passer },
      ),
    );

    // Then the create action is what refused it, so being allowed to pass a
    // Role grants nothing on its own.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:CreateFunction");
  });

  it("supplies iam:PassedToService for a policy conditioned on it", async () => {
    // Given a Role that may pass a Role only to Lambda, which is how a
    // CDK-generated deploy policy is commonly written.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const deployer = await roleAllowed(simAws, accountId, "deployer", [
      { Effect: "Allow", Action: "lambda:CreateFunction", Resource: "*" },
      {
        Effect: "Allow",
        Action: "iam:PassRole",
        Resource: "*",
        Condition: {
          StringEquals: { "iam:PassedToService": "lambda.amazonaws.com" },
        },
      },
    ]);

    // When it creates a function.
    const output = await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "reports",
        Role: `arn:aws:iam::${accountId}:role/JobRole`,
        Code: { ZipFile: makeLambdaZipFileInput(() => null) },
      }),
      { caller: deployer },
    );

    // Then the condition matched and the function was created.
    assertIdentical(output.FunctionName, "reports");

    await simAws.backgroundTasksComplete();
  });

  it("refuses a policy conditioned on passing to another service", async () => {
    // Given the same Role, allowed to pass a Role to ECS instead.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const deployer = await roleAllowed(simAws, accountId, "deployer", [
      { Effect: "Allow", Action: "lambda:CreateFunction", Resource: "*" },
      {
        Effect: "Allow",
        Action: "iam:PassRole",
        Resource: "*",
        Condition: {
          StringEquals: { "iam:PassedToService": "ecs-tasks.amazonaws.com" },
        },
      },
    ]);

    // When it creates a function.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().createFunction(
        new CreateFunctionCommand({
          FunctionName: "reports",
          Role: `arn:aws:iam::${accountId}:role/JobRole`,
          Code: { ZipFile: makeLambdaZipFileInput(() => null) },
        }),
        { caller: deployer },
      ),
    );

    // Then the statement matched nothing, because the service the Role went
    // to was Lambda.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "iam:PassRole");
  });

  it("leaves a request naming no caller decided as the Account root", async () => {
    // Given a simulation with no policies in it at all.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    // When a function is created without naming a caller.
    const output = await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "reports",
        Role: `arn:aws:iam::${accountId}:role/JobRole`,
        Code: { ZipFile: makeLambdaZipFileInput(() => null) },
      }),
    );

    // Then the root passed the Role as it passes everything else.
    assertIdentical(output.FunctionName, "reports");

    await simAws.backgroundTasksComplete();
  });
});

/**
 * A Role a request can be made as, carrying the statements it is given.
 */
async function roleAllowed(
  simAws: SimAws,
  accountId: SimAwsAccountId,
  roleName: string,
  statements: readonly SimIamPolicyDocumentStatement[],
): Promise<SimAwsCaller> {
  const simIam = simAws.iam();

  await simIam.createRole(
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

  await simIam.putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: `${roleName}-policy`,
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: statements,
      }),
    }),
  );

  return { kind: "arn", arn: `arn:aws:iam::${accountId}:role/${roleName}` };
}
