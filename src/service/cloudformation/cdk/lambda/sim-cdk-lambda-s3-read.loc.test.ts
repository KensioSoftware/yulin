import { InvokeCommand } from "@aws-sdk/client-lambda";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file and asset manifest to pass to sim CloudFormation.
 */
import { SimSdk } from "../../../../sdk/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

const objectContent = "Hello from sim S3 via CDK";

/**
 * Inline function code, as CDK packages Code.fromInline source. The AWS SDK
 * is provided by the simulated runtime, as on real Lambda, and calls run as
 * the function's execution role.
 */
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

describe("Sim CDK Lambda deployment local integration", () => {
  it("deploys a Lambda that reads a granted S3 object", async () => {
    // Given a data file for the bucket deployment.
    const simAws = new SimAws();
    const projectDirectory = new TemporaryDirectory();
    await projectDirectory.writeFile("data/greeting.txt", objectContent);
    const dataDirectory = projectDirectory.join("data");

    // And a CDK stack with a bucket holding the data object and a Lambda
    // function whose execution role is granted read access to the bucket.
    const cdkProject = new TestCdkProject({ projectDirectory });
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const dataBucket = new s3.Bucket(stack, "DataBucket");

new s3deploy.BucketDeployment(stack, "DeployData", {
  sources: [s3deploy.Source.asset(${JSON.stringify(dataDirectory)})],
  destinationBucket: dataBucket,
});

const readerFunction = new lambda.Function(stack, "ReaderFunction", {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline(${JSON.stringify(readObjectHandlerSource)}),
});

dataBucket.grantRead(readerFunction);

new cdk.CfnOutput(stack, "DataBucketName", {
  value: dataBucket.bucketName,
});
new cdk.CfnOutput(stack, "ReaderFunctionName", {
  value: readerFunction.functionName,
});

app.synth();
      `,
    );

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the template into sim CloudFormation.
    const stack = await simAws
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    // Then the Outputs should be available.
    const bucketName = stack.outputs.get("DataBucketName")?.value;
    const functionName = stack.outputs.get("ReaderFunctionName")?.value;
    assertTypeString(bucketName);
    assertTypeString(functionName);

    // And invoking the deployed function reads the deployed S3 object as the
    // granted execution role.
    const invokeOutput = await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: functionName,
        Payload: JSON.stringify({
          bucketName,
          objectKey: "greeting.txt",
        }),
      }),
    );

    assertIdentical(invokeOutput.StatusCode, 200);
    assertUndefined(invokeOutput.FunctionError);
    assertNonNullable(invokeOutput.Payload);
    const result = JSON.parse(Buffer.from(invokeOutput.Payload).toString()) as {
      content: string;
      contentLength: number;
    };
    assertIdentical(result.content, objectContent);
    assertIdentical(result.contentLength, objectContent.length);

    await simAws.backgroundTasksComplete();
  });

  it("binds a real in-process handler over the synthesized template", async () => {
    // Given a data file for the bucket deployment.
    const simAws = new SimAws();
    const projectDirectory = new TemporaryDirectory();
    await projectDirectory.writeFile("data/greeting.txt", objectContent);
    const dataDirectory = projectDirectory.join("data");

    // And a real in-process handler reading sim S3 through an intercepted
    // SDK client, closing over test state so it can be stepped through in a
    // debugger.
    using simSdk = new SimSdk({ simAws });
    const s3Client = new S3Client({ region: simAws.defaultRegionName });
    simSdk.intercept(s3Client);
    const observedEvents: unknown[] = [];
    const boundHandler = async (event: {
      bucketName: string;
      objectKey: string;
    }): Promise<{ content: string; source: string }> => {
      observedEvents.push(event);
      const output = await s3Client.send(
        new GetObjectCommand({
          Bucket: event.bucketName,
          Key: event.objectKey,
        }),
      );
      const content = (await output.Body?.transformToString()) ?? "";
      return { content, source: "bound-handler" };
    };

    // And a CDK stack whose function has placeholder inline code that the
    // binding will replace at deploy time.
    const cdkProject = new TestCdkProject({ projectDirectory });
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const dataBucket = new s3.Bucket(stack, "DataBucket");

new s3deploy.BucketDeployment(stack, "DeployData", {
  sources: [s3deploy.Source.asset(${JSON.stringify(dataDirectory)})],
  destinationBucket: dataBucket,
});

const readerFunction = new lambda.Function(stack, "ReaderFunction", {
  functionName: "cdk-bound-reader",
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline(
    "exports.handler = async () => 'replaced by binding';",
  ),
});

dataBucket.grantRead(readerFunction);

new cdk.CfnOutput(stack, "DataBucketName", {
  value: dataBucket.bucketName,
});

app.synth();
      `,
    );

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the template with the handler bound by function name.
    const stack = await simAws.cloudFormation().deployTemplateFile({
      templatePath: path.join(cdkOutDirectory, "TestStack.template.json"),
      bindings: [
        {
          functionName: "cdk-bound-reader",
          handler: boundHandler,
        },
      ],
    });
    await simAws.backgroundTasksComplete();

    const bucketName = stack.outputs.get("DataBucketName")?.value;
    assertTypeString(bucketName);

    // Then invoking the deployed function runs the bound handler in-process,
    // reading the deployed S3 object as the granted execution role.
    const invokeOutput = await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: "cdk-bound-reader",
        Payload: JSON.stringify({
          bucketName,
          objectKey: "greeting.txt",
        }),
      }),
    );

    assertIdentical(invokeOutput.StatusCode, 200);
    assertUndefined(invokeOutput.FunctionError);
    assertNonNullable(invokeOutput.Payload);
    const result = JSON.parse(Buffer.from(invokeOutput.Payload).toString()) as {
      content: string;
      source: string;
    };
    assertIdentical(result.content, objectContent);
    assertIdentical(result.source, "bound-handler");
    assertArrayLength(observedEvents, 1);

    await simAws.backgroundTasksComplete();
  });
});
