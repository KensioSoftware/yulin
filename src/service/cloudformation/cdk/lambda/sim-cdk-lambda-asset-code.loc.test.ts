import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import path from "node:path";
import { buffer } from "node:stream/consumers";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file and asset manifest to pass to sim CloudFormation.
 */
import { SimAws } from "../../../aws/sim-aws.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

/**
 * A multi-module handler directory, as `Code.fromAsset` bundles one: CDK
 * stages the directory in the cloud assembly, and the asset publisher has to
 * zip it whole for the local `require` to resolve.
 */
async function writeHandlerDirectory(
  projectDirectory: TemporaryDirectory,
): Promise<string> {
  await projectDirectory.writeFile(
    "handler/index.js",
    `const { greet } = require("./lib/greeter");
exports.handler = async (event) => ({ message: greet(event.name) });
`,
  );
  await projectDirectory.writeFile(
    "handler/lib/greeter.js",
    `exports.greet = (name) => "Hello " + name + " from a CDK asset";\n`,
  );

  return projectDirectory.join("handler");
}

describe("Sim CDK Lambda asset code local integration", () => {
  it("runs an asset function from a Stack with an explicit environment", async () => {
    // Given a CDK stack whose function code is a staged asset directory, for
    // a Stack synthesized with an explicit account and region, so the asset
    // bucket name is synthesized literally.
    const simAws = new SimAws();
    const projectDirectory = new TemporaryDirectory();
    const handlerDirectory = await writeHandlerDirectory(projectDirectory);

    const cdkProject = new TestCdkProject({ projectDirectory });
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const assetFunction = new lambda.Function(stack, "AssetFunction", {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromAsset(${JSON.stringify(handlerDirectory)}),
});

new cdk.CfnOutput(stack, "AssetFunctionName", {
  value: assetFunction.functionName,
});

app.synth();
      `,
    );

    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the synthesized template into sim CloudFormation.
    const stack = await simAws
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    // Then the function is deployed rather than skipped, with its asset code.
    // The Stack answers for the construct ID, so the hash CDK synthesized on
    // to the logical ID is not written down here to go stale.
    const functionResource = stack.getResource("AssetFunction");
    assertNonNullable(functionResource);
    assertUndefined(functionResource.skippedReason);

    const functionName = stack.outputs.get("AssetFunctionName")?.value;
    assertTypeString(functionName);

    // And invoking it runs the real asset code, including its local require.
    const invokeOutput = await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: functionName,
        Payload: JSON.stringify({ name: "Yulin" }),
      }),
    );

    assertIdentical(invokeOutput.StatusCode, 200);
    assertUndefined(invokeOutput.FunctionError);
    assertNonNullable(invokeOutput.Payload);
    const result = JSON.parse(Buffer.from(invokeOutput.Payload).toString()) as {
      message: string;
    };
    assertIdentical(result.message, "Hello Yulin from a CDK asset");

    // And the asset was published into the CDK staging Bucket in sim S3, as a
    // real `cdk deploy` publishes it before CloudFormation runs. The Bucket
    // is named as the template names it, in the scope the Stack deployed
    // into, which is where the function's code fetch looks for it.
    assertNonNullable(
      simAws
        .s3()
        .getSimBucketByName("cdk-hnb659fds-assets-111111111111-eu-west-2"),
    );

    await simAws.backgroundTasksComplete();
  });

  it("runs an asset function from an environment-agnostic Stack", async () => {
    // Given the same asset function in a Stack synthesized without an
    // environment, so the asset bucket name is a pseudo-parameter Fn::Sub
    // that only resolves against the deploying account and region.
    const simAws = new SimAws();
    const projectDirectory = new TemporaryDirectory();
    const handlerDirectory = await writeHandlerDirectory(projectDirectory);

    const cdkProject = new TestCdkProject({ projectDirectory });
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack");

const assetFunction = new lambda.Function(stack, "AssetFunction", {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromAsset(${JSON.stringify(handlerDirectory)}),
});

new cdk.CfnOutput(stack, "AssetFunctionName", {
  value: assetFunction.functionName,
});

app.synth();
      `,
    );

    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the synthesized template into sim CloudFormation.
    const stack = await simAws
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    const functionName = stack.outputs.get("AssetFunctionName")?.value;
    assertTypeString(functionName);

    // Then the published location and the template's Fn::Sub code location
    // agree, so the function runs its asset code.
    const invokeOutput = await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: functionName,
        Payload: JSON.stringify({ name: "Yulin" }),
      }),
    );

    assertIdentical(invokeOutput.StatusCode, 200);
    assertUndefined(invokeOutput.FunctionError);
    assertNonNullable(invokeOutput.Payload);
    const result = JSON.parse(Buffer.from(invokeOutput.Payload).toString()) as {
      message: string;
    };
    assertIdentical(result.message, "Hello Yulin from a CDK asset");

    await simAws.backgroundTasksComplete();
  });

  it("leaves out a CDK BucketDeployment provider function without calling it a gap", async () => {
    // Given a CDK stack using BucketDeployment, which synthesizes a Python
    // provider function into the stack alongside the user's own function.
    const simAws = new SimAws();
    const projectDirectory = new TemporaryDirectory();
    const handlerDirectory = await writeHandlerDirectory(projectDirectory);
    await projectDirectory.writeFile("data/greeting.txt", "Hello from sim S3");
    const dataDirectory = projectDirectory.join("data");

    const cdkProject = new TestCdkProject({ projectDirectory });
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack");

const dataBucket = new s3.Bucket(stack, "DataBucket");

new s3deploy.BucketDeployment(stack, "DeployData", {
  sources: [s3deploy.Source.asset(${JSON.stringify(dataDirectory)})],
  destinationBucket: dataBucket,
});

const assetFunction = new lambda.Function(stack, "AssetFunction", {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromAsset(${JSON.stringify(handlerDirectory)}),
});

new cdk.CfnOutput(stack, "AssetFunctionName", {
  value: assetFunction.functionName,
});
new cdk.CfnOutput(stack, "DataBucketName", { value: dataBucket.bucketName });

app.synth();
      `,
    );

    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the synthesized template into sim CloudFormation.
    const stack = await simAws
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    // Then the provider function is not created, because sim Lambda simulates
    // Node.js runtimes and this one is Python. It is not reported as a gap,
    // because sim CloudFormation simulates the BucketDeployment custom resource
    // directly rather than running its provider, so there is nothing left for
    // the function to have done.
    const providerResource = stack.resources
      .values()
      .find(
        (resource) =>
          resource.type === "AWS::Lambda::Function" &&
          resource.logicalId.startsWith("CustomCDKBucketDeployment"),
      );
    assertNonNullable(providerResource);
    assertFalse(providerResource.skipped);
    assertTrue(providerResource.inert);
    assertNonNullable(providerResource.inertReason);
    assertStringIncludes(
      providerResource.inertReason,
      "Custom::CDKBucketDeployment",
    );

    // And the user's own asset function still deploys and runs.
    const functionName = stack.outputs.get("AssetFunctionName")?.value;
    assertTypeString(functionName);

    const invokeOutput = await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: functionName,
        Payload: JSON.stringify({ name: "Yulin" }),
      }),
    );

    assertIdentical(invokeOutput.StatusCode, 200);
    assertUndefined(invokeOutput.FunctionError);

    // And the bucket deployment itself still delivered its objects, as it is
    // simulated directly rather than by running the skipped provider.
    const bucketName = stack.outputs.get("DataBucketName")?.value;
    assertTypeString(bucketName);
    assertNonNullable(simAws.s3().getSimBucketByName(bucketName));

    const deployedObject = await simAws
      .s3()
      .getObject({ input: { Bucket: bucketName, Key: "greeting.txt" } });
    assertNonNullable(deployedObject.Body);
    const deployedBytes = await buffer(deployedObject.Body);
    assertIdentical(deployedBytes.toString(), "Hello from sim S3");

    await simAws.backgroundTasksComplete();
  });
});
