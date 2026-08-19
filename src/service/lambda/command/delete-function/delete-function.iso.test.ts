import { CreateRoleCommand } from "@aws-sdk/client-iam";
import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  GetFunctionUrlConfigCommand,
  ListVersionsByFunctionCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimLambdaResourceNotFoundException } from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import { SimLambda } from "../../sim-lambda.js";

const roleArn = "arn:aws:iam::111111111111:role/FunctionRole";

async function givenFunction(
  simLambda: SimLambda,
  functionName: string,
): Promise<void> {
  await simLambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: roleArn,
      Handler: "index.handler",
      Runtime: "nodejs22.x",
      Code: { ZipFile: makeLambdaZipFileInput(() => null) },
    }),
  );
}

describe("Lambda DeleteFunctionCommand", () => {
  it("takes the function's published versions with it", async () => {
    // Given a function with a published version, deleted and made again.
    const simLambda = new SimLambda();
    await givenFunction(simLambda, "disposable");
    await simLambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "disposable" }),
    );
    await simLambda.deleteFunction(
      new DeleteFunctionCommand({ FunctionName: "disposable" }),
    );
    await givenFunction(simLambda, "disposable");

    // When the new function's versions are listed.
    const listed = await simLambda.listVersionsByFunction(
      new ListVersionsByFunctionCommand({ FunctionName: "disposable" }),
    );

    // Then nothing published from the old one is left, and the next version
    // it publishes starts again at 1.
    assertArrayEquals(
      listed.Versions.map((version) => version.Version),
      ["$LATEST"],
    );
    const published = await simLambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "disposable" }),
    );
    assertIdentical(published.Version, "1");
  });

  it("deletes a function so it can no longer be read", async () => {
    // Given an existing function.
    const simLambda = new SimLambda();
    await givenFunction(simLambda, "disposable");

    // When the function is deleted.
    await simLambda.deleteFunction(
      new DeleteFunctionCommand({ FunctionName: "disposable" }),
    );

    // Then Lambda no longer has it.
    assertUndefined(simLambda.getSimFunctionByName("disposable"));

    const error = await assertThrowsErrorAsync(async () =>
      simLambda.getFunction(
        new GetFunctionCommand({ FunctionName: "disposable" }),
      ),
    );
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
  });

  it("deletes the Function URL that belongs to the function", async () => {
    // Given a function with a Function URL.
    const simLambda = new SimLambda();
    await givenFunction(simLambda, "urled");
    await simLambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "urled",
        AuthType: "NONE",
      }),
    );

    // When the function is deleted.
    await simLambda.deleteFunction(
      new DeleteFunctionCommand({ FunctionName: "urled" }),
    );

    // Then the URL goes with it, as a Function URL is part of the function.
    assertUndefined(simLambda.getSimFunctionUrl("urled"));

    const error = await assertThrowsErrorAsync(async () =>
      simLambda.getFunctionUrlConfig(
        new GetFunctionUrlConfigCommand({ FunctionName: "urled" }),
      ),
    );
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
  });

  it("frees the function name for a new function", async () => {
    // Given a function that has been deleted.
    const simLambda = new SimLambda();
    await givenFunction(simLambda, "recreated");
    await simLambda.deleteFunction(
      new DeleteFunctionCommand({ FunctionName: "recreated" }),
    );

    // When a new function is created under the same name.
    await givenFunction(simLambda, "recreated");

    // Then it is there, because the name was released.
    const output = await simLambda.getFunction(
      new GetFunctionCommand({ FunctionName: "recreated" }),
    );
    assertIdentical(output.Configuration.FunctionName, "recreated");
  });

  it("throws on a function that does not exist", async () => {
    // Given a simulated Lambda without the requested function.
    const simAws = new SimAws();

    // When the missing function is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .deleteFunction(new DeleteFunctionCommand({ FunctionName: "missing" })),
    );

    // Then Lambda answers with its not-found error, naming the function ARN.
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(
      error.message,
      `arn:aws:lambda:${simAws.defaultRegionName}:` +
        `${simAws.defaultAccountId}:function:missing`,
    );
  });

  it("rejects a missing required FunctionName input", async () => {
    // Given a simulated Lambda.
    const simLambda = new SimLambda();

    // When DeleteFunction is called without its required FunctionName.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.deleteFunction(
        // @ts-expect-error -- testing invalid input
        new DeleteFunctionCommand({}),
      ),
    );

    // Then request validation identifies the missing input.
    assertStringIncludes(
      error.message,
      "DeleteFunctionCommand.input.FunctionName",
    );
  });

  it("denies a caller without DeleteFunction permission", async () => {
    // Given a function and a Role with no Lambda grant.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simLambda = simAws.lambda();

    await givenFunction(simLambda, "protected-function");
    const roleCreation = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "UnprivilegedFunctionRemover",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    // When the unprivileged Role deletes the function.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.deleteFunction(
        new DeleteFunctionCommand({ FunctionName: "protected-function" }),
        { caller: { kind: "arn", arn: roleCreation.Role.Arn } },
      ),
    );

    // Then IAM denies the removal action, and the function stays.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:DeleteFunction");
    assertInstanceOf(
      simLambda.getSimFunctionByName("protected-function"),
      Object,
    );
  });
});
