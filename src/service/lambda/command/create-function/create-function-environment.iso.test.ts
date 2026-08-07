import {
  CreateFunctionCommand,
  GetFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimLambdaInvalidParameterValueException,
  SimLambdaValidationException,
} from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";

const roleArn = "arn:aws:iam::111111111111:role/GreeterRole";
const code = {
  ZipFile: makeLambdaZipFileInput(() => "Hello"),
};

describe("Lambda CreateFunctionCommand environment", () => {
  it("reports the declared variables in the function configuration", async () => {
    // Given a function created with environment variables.
    const simAws = new SimAws();
    const simLambda = simAws.lambda();

    const creation = await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: roleArn,
        Code: code,
        Environment: {
          Variables: { GREETING: "Hello", TABLE_NAME: "widgets" },
        },
      }),
    );

    // Then CreateFunction reports them back, as real Lambda does.
    assertObjectEquals(creation.Environment, {
      Variables: { GREETING: "Hello", TABLE_NAME: "widgets" },
    });

    // And GetFunction reports them too.
    await simAws.backgroundTasksComplete();
    const fetched = await simLambda.getFunction(
      new GetFunctionCommand({ FunctionName: "greeter" }),
    );
    assertObjectEquals(fetched.Configuration.Environment, {
      Variables: { GREETING: "Hello", TABLE_NAME: "widgets" },
    });
  });

  it("leaves Environment off a function that declares none", async () => {
    // Given a function created without environment variables.
    const simLambda = new SimAws().lambda();

    const creation = await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: roleArn,
        Code: code,
      }),
    );

    // Then the configuration omits Environment entirely, as AWS does.
    assertUndefined(creation.Environment);
  });

  it("rejects the environment variable names AWS reserves", async () => {
    // Given a function declaring a name reserved for the Lambda runtime.
    const simLambda = new SimAws().lambda();

    // When it is created.
    const error = await assertThrowsErrorAsync(async () => {
      await simLambda.createFunction(
        new CreateFunctionCommand({
          FunctionName: "greeter",
          Role: roleArn,
          Code: code,
          Environment: {
            Variables: { AWS_REGION: "us-east-1", TABLE_NAME: "widgets" },
          },
        }),
      );
    });

    // Then it fails AWS-style, naming the reserved key.
    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertIdentical(error.name, "InvalidParameterValueException");
    assertStringIncludes(error.message, "reserved keys");
    assertStringIncludes(error.message, "AWS_REGION");
  });

  it("names every reserved key used in the request", async () => {
    // Given a function declaring several reserved names at once.
    const simLambda = new SimAws().lambda();

    // When it is created.
    const error = await assertThrowsErrorAsync(async () => {
      await simLambda.createFunction(
        new CreateFunctionCommand({
          FunctionName: "greeter",
          Role: roleArn,
          Code: code,
          Environment: {
            Variables: {
              LAMBDA_TASK_ROOT: "/var/task",
              AWS_SESSION_TOKEN: "token",
            },
          },
        }),
      );
    });

    // Then all of them are reported, so one fix covers the lot.
    assertStringIncludes(error.message, "AWS_SESSION_TOKEN, LAMBDA_TASK_ROOT");
  });

  it("rejects the metadata and concurrency runtime names", async () => {
    // Given the reserved names Lambda provides for the metadata endpoint and
    // managed instances, which are easy to miss in the reserved list.
    const simLambda = new SimAws().lambda();

    // When a function declaring them is created.
    const error = await assertThrowsErrorAsync(async () => {
      await simLambda.createFunction(
        new CreateFunctionCommand({
          FunctionName: "greeter",
          Role: roleArn,
          Code: code,
          Environment: {
            Variables: {
              AWS_LAMBDA_METADATA_API: "169.254.100.1:9001",
              AWS_LAMBDA_METADATA_TOKEN: "token",
              AWS_LAMBDA_MAX_CONCURRENCY: "1",
            },
          },
        }),
      );
    });

    // Then all three are reported as reserved.
    assertStringIncludes(
      error.message,
      "AWS_LAMBDA_MAX_CONCURRENCY, AWS_LAMBDA_METADATA_API, " +
        "AWS_LAMBDA_METADATA_TOKEN",
    );
  });

  it("rejects variable names that break the AWS name pattern", async () => {
    // Given names starting with a digit, holding a hyphen, and one character
    // long, none of which real Lambda accepts.
    const simLambda = new SimAws().lambda();

    // When a function declaring them is created.
    const error = await assertThrowsErrorAsync(async () => {
      await simLambda.createFunction(
        new CreateFunctionCommand({
          FunctionName: "greeter",
          Role: roleArn,
          Code: code,
          Environment: {
            Variables: { "1TABLE": "widgets", "MY-VAR": "x", A: "y" },
          },
        }),
      );
    });

    // Then it fails as an AWS constraint violation, naming the offenders.
    assertInstanceOf(error, SimLambdaValidationException);
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "regular expression pattern");
    assertStringIncludes(error.message, "1TABLE, A, MY-VAR");
  });

  it("reports a reserved name that also breaks the pattern as invalid", async () => {
    // Given _HANDLER, which is reserved and also starts with an underscore.
    const simLambda = new SimAws().lambda();

    // When a function declaring it is created.
    const error = await assertThrowsErrorAsync(async () => {
      await simLambda.createFunction(
        new CreateFunctionCommand({
          FunctionName: "greeter",
          Role: roleArn,
          Code: code,
          Environment: { Variables: { _HANDLER: "index.handler" } },
        }),
      );
    });

    // Then the constraint violation wins, as it does on real AWS, where the
    // API constraint is checked before the reserved-name rule.
    assertInstanceOf(error, SimLambdaValidationException);
    assertStringIncludes(error.message, "_HANDLER");
  });

  it("accepts a two-character name, the shortest AWS allows", async () => {
    // Given the shortest name the AWS pattern permits.
    const simLambda = new SimAws().lambda();

    const creation = await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: roleArn,
        Code: code,
        Environment: { Variables: { A1: "widgets", table_name_2: "gadgets" } },
      }),
    );

    // Then it is accepted, along with the other legal name shapes.
    assertObjectEquals(creation.Environment, {
      Variables: { A1: "widgets", table_name_2: "gadgets" },
    });
  });

  it("accepts an Environment with no Variables", async () => {
    // Given an Environment property with nothing in it.
    const simLambda = new SimAws().lambda();

    const creation = await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: roleArn,
        Code: code,
        Environment: {},
      }),
    );

    // Then the function is created with no declared variables.
    assertUndefined(creation.Environment);
  });
});
