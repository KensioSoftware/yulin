import { GetParameterCommand } from "@aws-sdk/client-ssm";
import { assertIdentical, assertTypeString } from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template files to pass to sim CloudFormation, so the Export and the
 * Fn::ImportValue under test are the ones CDK actually emits for a value
 * shared between two Stacks of one app.
 */
import { SimAws } from "../../../aws/sim-aws.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

const accountIdOneOnes = "111111111111";

describe("Sim CDK cross-stack export local integration", () => {
  it("deploys a consumer Stack that imports a producer Stack's Bucket name", async () => {
    // Given one CDK app of two Stacks, where the consumer reads a Bucket the
    // producer owns. Nothing here opts into an export: naming the Bucket from
    // the other Stack is what makes CDK write one.
    const cdkProject = new TestCdkProject();
    await cdkProject.writeCdkAppFile(`
import * as cdk from "aws-cdk-lib/core";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ssm from "aws-cdk-lib/aws-ssm";

const app = new cdk.App();
const environment = { account: "111111111111", region: "eu-west-2" };

const producer = new cdk.Stack(app, "ProducerStack", { env: environment });
const uploads = new s3.Bucket(producer, "Uploads", {
  bucketName: "cross-stack-uploads",
});

const consumer = new cdk.Stack(app, "ConsumerStack", { env: environment });
new ssm.StringParameter(consumer, "UploadsBucketName", {
  parameterName: "/myapp/uploads-bucket",
  stringValue: uploads.bucketName,
});

app.synth();
    `);

    const cdkOutDirectory = await cdkProject.synth();

    // When both synthesized templates are deployed into the same simulated
    // Account and Region, producer first.
    const simAws = new SimAws();
    const scoped = simAws.account(accountIdOneOnes).region("eu-west-2");
    const cloudFormation = scoped.cloudFormation();

    await cloudFormation.deployTemplateFile(
      path.join(cdkOutDirectory, "ProducerStack.template.json"),
    );
    await cloudFormation.deployTemplateFile(
      path.join(cdkOutDirectory, "ConsumerStack.template.json"),
    );
    await simAws.backgroundTasksComplete();

    // Then the consumer's Parameter holds the Bucket name the producer
    // exported, resolved through the Fn::ImportValue CDK emitted.
    const read = await scoped
      .ssm()
      .getParameter(new GetParameterCommand({ Name: "/myapp/uploads-bucket" }));

    assertTypeString(read.Parameter?.Value);
    assertIdentical(read.Parameter.Value, "cross-stack-uploads");

    await simAws.backgroundTasksComplete();
  });
});
