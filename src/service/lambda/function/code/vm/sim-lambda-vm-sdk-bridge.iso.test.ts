import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import { makeLambdaCodeZip } from "../make-lambda-code-zip.js";
import { SimLambda } from "../../../sim-lambda.js";

const readObjectHandlerSource = `
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const s3Client = new S3Client({});
exports.handler = async (event) => {
  const output = await s3Client.send(
    new GetObjectCommand({ Bucket: event.bucketName, Key: event.objectKey }),
  );
  const content = await output.Body.transformToString();
  return { content, contentLength: content.length };
};
`;

async function createExecutionRole(
  simAws: SimAws,
  roleName: string,
): Promise<string> {
  const roleCreation = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );
  return roleCreation.Role.Arn;
}

async function allowGetObject(
  simAws: SimAws,
  roleName: string,
  bucketName: string,
): Promise<void> {
  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: "ReadCodeObject",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: "s3:GetObject",
          Resource: `arn:aws:s3:::${bucketName}/*`,
        },
      }),
    }),
  );
}

async function putObject(
  simAws: SimAws,
  bucketName: string,
  objectKey: string,
  content: string,
): Promise<void> {
  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: bucketName }));
  await simAws.s3().putObject(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: content,
    }),
  );
}

function parsePayload(payload: Uint8Array | undefined): unknown {
  assertNonNullable(payload);
  return JSON.parse(Buffer.from(payload).toString()) as unknown;
}

describe("Lambda vm runtime AWS SDK bridge", () => {
  it("lets vm function code read sim S3 with the provided SDK", async () => {
    // Given a sim S3 object and an execution role allowed to read it.
    const simAws = new SimAws();
    await putObject(simAws, "data-bucket", "greeting.txt", "Hello from S3");
    const roleArn = await createExecutionRole(simAws, "ReaderRole");
    await allowGetObject(simAws, "ReaderRole", "data-bucket");

    // And a function whose zip code uses the runtime-provided AWS SDK.
    const simLambda = simAws.lambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "reader",
        Role: roleArn,
        Handler: "index.handler",
        Code: { ZipFile: makeLambdaCodeZip(readObjectHandlerSource) },
      }),
    );

    // When the function is invoked.
    const output = await simLambda.invoke(
      new InvokeCommand({
        FunctionName: "reader",
        Payload: JSON.stringify({
          bucketName: "data-bucket",
          objectKey: "greeting.txt",
        }),
      }),
    );

    // Then the handler read the object through simulated S3 as its
    // execution role.
    assertIdentical(output.StatusCode, 200);
    assertUndefined(output.FunctionError);
    const result = parsePayload(output.Payload) as {
      content: string;
      contentLength: number;
    };
    assertIdentical(result.content, "Hello from S3");
    assertIdentical(result.contentLength, "Hello from S3".length);

    await simAws.backgroundTasksComplete();
  });

  it("denies vm SDK calls the execution role has no permission for", async () => {
    // Given a sim S3 object and an execution role with no S3 permissions.
    const simAws = new SimAws();
    await putObject(simAws, "data-bucket", "greeting.txt", "Hello from S3");
    const roleArn = await createExecutionRole(simAws, "NoReadRole");

    const simLambda = simAws.lambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "denied-reader",
        Role: roleArn,
        Handler: "index.handler",
        Code: { ZipFile: makeLambdaCodeZip(readObjectHandlerSource) },
      }),
    );

    // When the function is invoked.
    const output = await simLambda.invoke(
      new InvokeCommand({
        FunctionName: "denied-reader",
        Payload: JSON.stringify({
          bucketName: "data-bucket",
          objectKey: "greeting.txt",
        }),
      }),
    );

    // Then simulated IAM denied the in-handler read, reported AWS-style as
    // an unhandled invocation error.
    assertIdentical(output.StatusCode, 200);
    assertIdentical(output.FunctionError, "Unhandled");
    const errorDocument = parsePayload(output.Payload) as {
      errorMessage: string;
    };
    assertStringIncludes(errorDocument.errorMessage, "s3:GetObject");

    await simAws.backgroundTasksComplete();
  });

  it("prefers SDK packages bundled in the code archive", async () => {
    // Given a function whose archive bundles its own @aws-sdk package.
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    const bundledSdkZip = makeLambdaCodeZip({
      "index.js":
        'const sdk = require("@aws-sdk/client-s3");\n' +
        "exports.handler = async () => sdk.stubMarker;",
      "node_modules/@aws-sdk/client-s3/package.json":
        '{ "name": "@aws-sdk/client-s3", "main": "index.js" }',
      "node_modules/@aws-sdk/client-s3/index.js":
        'exports.stubMarker = "bundled-stub";',
    });
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "bundled-sdk",
        Role: "arn:aws:iam::111111111111:role/BundledSdkRole",
        Handler: "index.handler",
        Code: { ZipFile: bundledSdkZip },
      }),
    );

    // When the function is invoked.
    const output = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "bundled-sdk" }),
    );

    // Then the bundled package was used, not the host-provided one.
    assertIdentical(parsePayload(output.Payload), "bundled-stub");

    await simAws.backgroundTasksComplete();
  });

  it("passes SDK command classes through into the vm untouched", async () => {
    // Given a function that constructs an SDK command without sending it.
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "command-builder",
        Role: "arn:aws:iam::111111111111:role/CommandBuilderRole",
        Handler: "index.handler",
        Code: {
          ZipFile: makeLambdaCodeZip(
            'const { GetObjectCommand } = require("@aws-sdk/client-s3");\n' +
              "exports.handler = async () => {\n" +
              '  const command = new GetObjectCommand({ Bucket: "b", Key: "k" });\n' +
              "  return command.constructor.name;\n" +
              "};",
          ),
        },
      }),
    );

    // When the function is invoked.
    const output = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "command-builder" }),
    );

    // Then the real command class behaved normally inside the vm.
    assertIdentical(parsePayload(output.Payload), "GetObjectCommand");

    await simAws.backgroundTasksComplete();
  });

  it("reports missing SDK wiring for a standalone SimLambda", async () => {
    // Given a standalone SimLambda with no simulated AWS environment.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "standalone-sdk",
        Role: "arn:aws:iam::111111111111:role/StandaloneRole",
        Handler: "index.handler",
        Code: { ZipFile: makeLambdaCodeZip(readObjectHandlerSource) },
      }),
    );

    // When the function is invoked.
    const output = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "standalone-sdk" }),
    );

    // Then the import fails with guidance on wiring the SDK provider.
    assertIdentical(output.FunctionError, "Unhandled");
    const errorDocument = parsePayload(output.Payload) as {
      errorType: string;
      errorMessage: string;
    };
    assertIdentical(errorDocument.errorType, "Runtime.ImportModuleError");
    assertStringIncludes(errorDocument.errorMessage, "vmSdkModuleProvider");
  });

  it("keeps reporting unbundled non-SDK packages with the archive error", async () => {
    // Given a function requiring a package that is neither bundled nor an
    // AWS SDK package.
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "missing-package",
        Role: "arn:aws:iam::111111111111:role/MissingPackageRole",
        Handler: "index.handler",
        Code: {
          ZipFile: makeLambdaCodeZip(
            'const leftPad = require("left-pad");\n' +
              "exports.handler = async () => leftPad;",
          ),
        },
      }),
    );

    // When the function is invoked.
    const output = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "missing-package" }),
    );

    // Then the original archive resolution error is reported.
    assertIdentical(output.FunctionError, "Unhandled");
    const errorDocument = parsePayload(output.Payload) as {
      errorType: string;
      errorMessage: string;
    };
    assertIdentical(errorDocument.errorType, "Runtime.ImportModuleError");
    assertStringIncludes(errorDocument.errorMessage, "left-pad");

    await simAws.backgroundTasksComplete();
  });
});
