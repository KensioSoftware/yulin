import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  SimLambdaError,
  SimLambdaInvalidParameterValueException,
} from "../../error/sim-lambda.error.js";
import { makeLambdaCodeZip } from "../../function/code/make-lambda-code-zip.js";
import { SimLambda } from "../../sim-lambda.js";

async function putCodeZip(
  simAws: SimAws,
  bucketName: string,
  objectKey: string,
  source: string,
): Promise<void> {
  const simS3 = simAws.s3();
  const codeZip = makeLambdaCodeZip(source);
  await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
  await simS3.putObject(
    new PutObjectCommand({ Bucket: bucketName, Key: objectKey, Body: codeZip }),
  );
}

describe("Lambda CreateFunctionCommand S3 code location", () => {
  it("creates and invokes a function from a code zip stored in sim S3", async () => {
    // Given a code zip archive stored in sim S3, as SAM and CDK deploy.
    const simAws = new SimAws();
    await putCodeZip(
      simAws,
      "code-bucket",
      "artifacts/greeter.zip",
      "exports.handler = async (event) => 'Hello ' + event.name + ' from S3';",
    );

    // When a function is created from the S3 object location and invoked.
    const simLambda = simAws.lambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "s3-greeter",
        Role: `arn:aws:iam::${simAws.defaultAccountId}:role/GreeterRole`,
        Handler: "index.handler",
        Code: { S3Bucket: "code-bucket", S3Key: "artifacts/greeter.zip" },
      }),
    );
    const output = await simLambda.invoke(
      new InvokeCommand({
        FunctionName: "s3-greeter",
        Payload: JSON.stringify({ name: "Yulin" }),
      }),
    );

    // Then the stored code ran in the simulated runtime.
    assertIdentical(output.StatusCode, 200);
    assertNonNullable(output.Payload);
    assertIdentical(
      JSON.parse(Buffer.from(output.Payload).toString()),
      "Hello Yulin from S3",
    );

    await simAws.backgroundTasksComplete();
  });

  it("reports a missing code object like real AWS", async () => {
    // Given a bucket without the referenced code object.
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "code-bucket" }));

    // When a function creation references the missing object.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().createFunction(
        new CreateFunctionCommand({
          FunctionName: "missing-code",
          Role: "arn:aws:iam::111111111111:role/SomeRole",
          Handler: "index.handler",
          Code: { S3Bucket: "code-bucket", S3Key: "not-there.zip" },
        }),
      ),
    );

    // Then the S3 lookup failure is wrapped AWS-style.
    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(error.message, "Error occurred while GetObject");
    assertStringIncludes(error.message, "NoSuchKey");

    await simAws.backgroundTasksComplete();
  });

  it("reports a missing code bucket like real AWS", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().createFunction(
        new CreateFunctionCommand({
          FunctionName: "missing-bucket",
          Role: "arn:aws:iam::111111111111:role/SomeRole",
          Handler: "index.handler",
          Code: { S3Bucket: "no-such-bucket", S3Key: "code.zip" },
        }),
      ),
    );

    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(error.message, "NoSuchBucket");
  });

  it("authorizes the code object fetch as the creating caller", async () => {
    // Given a caller Role allowed to create functions and to pass the
    // execution role, but not to read the code object from sim S3.
    const simAws = new SimAws();
    const accountId = simAws.defaultAccountId;
    await putCodeZip(
      simAws,
      "guarded-bucket",
      "code.zip",
      "exports.handler = async () => null;",
    );

    const simIam = simAws.iam();
    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "FunctionCreatorNoS3",
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
    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "FunctionCreatorNoS3",
        PolicyName: "CreateOnly",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: ["lambda:CreateFunction", "iam:PassRole"],
            Resource: "*",
          },
        }),
      }),
    );

    // When the Role creates a function from the S3 code object.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().createFunction(
        new CreateFunctionCommand({
          FunctionName: "s3-denied",
          Role: `arn:aws:iam::${accountId}:role/ExecutionRole`,
          Handler: "index.handler",
          Code: { S3Bucket: "guarded-bucket", S3Key: "code.zip" },
        }),
        { caller: { kind: "arn", arn: roleCreation.Role.Arn } },
      ),
    );

    // Then sim IAM denies the s3:GetObject fetch for the caller, as real
    // Lambda requires the creating principal to have code object access.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:GetObject");

    await simAws.backgroundTasksComplete();
  });

  it("explains that a standalone SimLambda has no sim S3 code store", async () => {
    // Given a SimLambda constructed directly, outside SimAws.
    const simLambda = new SimLambda();

    // When a function creation references an S3 code location.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.createFunction(
        new CreateFunctionCommand({
          FunctionName: "storeless",
          Role: "arn:aws:iam::111111111111:role/SomeRole",
          Handler: "index.handler",
          Code: { S3Bucket: "code-bucket", S3Key: "code.zip" },
        }),
      ),
    );

    // Then the sim explains how to wire up code storage.
    assertInstanceOf(error, SimLambdaError);
    assertStringIncludes(error.message, "no sim S3 code store");
    assertStringIncludes(error.message, "s3://code-bucket/code.zip");
  });
});
