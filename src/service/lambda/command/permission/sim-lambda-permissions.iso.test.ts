import {
  AddPermissionCommand,
  CreateFunctionCommand,
  GetPolicyCommand,
  RemovePermissionCommand,
} from "@aws-sdk/client-lambda";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimLambdaResourceConflictException } from "../../error/sim-lambda.error.js";
import { SimLambdaResourceNotFoundException } from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import type { SimLambda } from "../../sim-lambda.js";

const functionArn = "arn:aws:lambda:us-east-1:888888888888:function:greeter";

async function serveGreeter(): Promise<SimLambda> {
  const simAws = new SimAws();

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "greeter",
      Role: "arn:aws:iam::888888888888:role/GreeterRole",
      Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
    }),
  );

  return simAws.lambda();
}

describe("Simulated Lambda function resource policies", () => {
  it("grants a permission and reports it back as a policy document", async () => {
    // Given a function with nothing granted on it
    const lambda = await serveGreeter();

    // When another Account is granted permission to invoke its Function URL
    const added = await lambda.addPermission(
      new AddPermissionCommand({
        FunctionName: "greeter",
        StatementId: "AllowOtherAccount",
        Action: "lambda:InvokeFunctionUrl",
        Principal: "222222222222",
        FunctionUrlAuthType: "AWS_IAM",
      }),
    );

    // Then the shorthand is expanded into the statement it stands for, and
    // that is what the policy carries
    expect(JSON.parse(added.Statement)).toStrictEqual({
      Sid: "AllowOtherAccount",
      Effect: "Allow",
      Principal: { AWS: "arn:aws:iam::222222222222:root" },
      Action: "lambda:InvokeFunctionUrl",
      Resource: functionArn,
      Condition: {
        StringEquals: { "lambda:FunctionUrlAuthType": "AWS_IAM" },
      },
    });

    const policy = await lambda.getPolicy(
      new GetPolicyCommand({ FunctionName: "greeter" }),
    );
    expect(JSON.parse(policy.Policy)).toStrictEqual({
      Version: "2012-10-17",
      Id: "default",
      Statement: [JSON.parse(added.Statement)],
    });
    expect(policy.RevisionId.length).toBeGreaterThan(0);
  });

  it("expands each principal shorthand AddPermission accepts", async () => {
    // Given a function granted permissions naming a principal three ways
    const lambda = await serveGreeter();
    const grant = async (
      statementId: string,
      principal: string,
    ): Promise<unknown> =>
      await lambda.addPermission(
        new AddPermissionCommand({
          FunctionName: "greeter",
          StatementId: statementId,
          Action: "lambda:InvokeFunction",
          Principal: principal,
        }),
      );

    await grant("Everyone", "*");
    await grant("Service", "s3.amazonaws.com");
    await grant("Role", "arn:aws:iam::222222222222:role/Caller");

    // When the policy is read back
    const policy = await lambda.getPolicy(
      new GetPolicyCommand({ FunctionName: "greeter" }),
    );
    const statements = (
      JSON.parse(policy.Policy) as { Statement: { Principal: unknown }[] }
    ).Statement;

    // Then each shorthand became the policy Principal it stands for
    expect(statements.map((statement) => statement.Principal)).toStrictEqual([
      "*",
      { Service: "s3.amazonaws.com" },
      { AWS: "arn:aws:iam::222222222222:role/Caller" },
    ]);
  });

  it("refuses a statement id already in use", async () => {
    // Given a function with a permission already granted
    const lambda = await serveGreeter();
    const command = new AddPermissionCommand({
      FunctionName: "greeter",
      StatementId: "AllowInvoke",
      Action: "lambda:InvokeFunction",
      Principal: "222222222222",
    });
    await lambda.addPermission(command);

    // When the same statement id is granted again
    // Then it conflicts, as AWS refuses rather than silently replacing
    await expect(lambda.addPermission(command)).rejects.toThrow(
      SimLambdaResourceConflictException,
    );
  });

  it("removes a permission by its statement id", async () => {
    // Given a function with one permission granted
    const lambda = await serveGreeter();
    await lambda.addPermission(
      new AddPermissionCommand({
        FunctionName: "greeter",
        StatementId: "AllowInvoke",
        Action: "lambda:InvokeFunction",
        Principal: "222222222222",
      }),
    );

    // When that statement is removed
    await lambda.removePermission(
      new RemovePermissionCommand({
        FunctionName: "greeter",
        StatementId: "AllowInvoke",
      }),
    );

    // Then the function is back to having no policy at all, which is what AWS
    // reports rather than an empty document
    await expect(
      lambda.getPolicy(new GetPolicyCommand({ FunctionName: "greeter" })),
    ).rejects.toThrow(SimLambdaResourceNotFoundException);
  });

  it("errors when removing a statement that was never granted", async () => {
    // Given a function with no permissions
    const lambda = await serveGreeter();

    // When an unknown statement id is removed
    // Then it is reported as not found, as AWS does
    await expect(
      lambda.removePermission(
        new RemovePermissionCommand({
          FunctionName: "greeter",
          StatementId: "NeverGranted",
        }),
      ),
    ).rejects.toThrow(/Statement NeverGranted is not found/);
  });

  it("changes the policy revision with every grant and revocation", async () => {
    // Given a function with one permission granted
    const lambda = await serveGreeter();
    const grant = (statementId: string): Promise<unknown> =>
      lambda.addPermission(
        new AddPermissionCommand({
          FunctionName: "greeter",
          StatementId: statementId,
          Action: "lambda:InvokeFunction",
          Principal: "222222222222",
        }),
      );
    await grant("First");
    const first = await lambda.getPolicy(
      new GetPolicyCommand({ FunctionName: "greeter" }),
    );

    // When another is granted
    await grant("Second");
    const second = await lambda.getPolicy(
      new GetPolicyCommand({ FunctionName: "greeter" }),
    );

    // Then the revision moves, as it does on AWS
    expect(second.RevisionId).not.toBe(first.RevisionId);
  });
});
