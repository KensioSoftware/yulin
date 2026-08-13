import {
  DescribeKeyValueStoreCommand,
  PutKeyCommand,
} from "@aws-sdk/client-cloudfront-keyvaluestore";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
} from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file to pass to sim CloudFormation, so the template under test is
 * one CDK actually produced rather than one written by hand.
 */
import { SimAws } from "../../../aws/sim-aws.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

const accountIdOneOnes = "111111111111";

/**
 * A Function reading its associated store, written the way CDK inlines it.
 */
const redirectFunctionSource = `
import cf from "cloudfront";

async function handler(event) {
  var request = event.request;

  if (await cf.kvs().exists(request.uri)) {
    request.uri = await cf.kvs().get(request.uri);
  }

  return request;
}
`;

describe("Sim CDK CloudFront key value store deployment local integration", () => {
  it("deploys a CDK key value store a CDK Function reads", async () => {
    // Given a CDK stack with a key value store and a CloudFront Function
    // that CDK associates with it
    const cdkProject = new TestCdkProject();
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const store = new cloudfront.KeyValueStore(stack, "Redirects", {
  keyValueStoreName: "redirects",
  comment: "Where old paths go",
});

new cloudfront.Function(stack, "RedirectFunction", {
  functionName: "cdk-redirect-cff",
  runtime: cloudfront.FunctionRuntime.JS_2_0,
  code: cloudfront.FunctionCode.fromInline(${JSON.stringify(redirectFunctionSource)}),
  keyValueStore: store,
});

new cdk.CfnOutput(stack, "StoreArn", { value: store.keyValueStoreArn });

app.synth();
      `,
    );

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the synthesized template, with no hand-editing of the
    // AWS::CloudFront::KeyValueStore Resource CDK emits
    const simAws = new SimAws();
    const scoped = simAws.account(accountIdOneOnes).region("eu-west-2");
    const stack = await scoped
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    // Then the store CDK declared is there, and its ARN is what CDK output
    const store = scoped.cloudFront().keyValueStores().byName("redirects");
    assertNonNullable(store);
    assertIdentical(stack.outputs.get("StoreArn")?.value, store.arn);
    assertIdentical(store.status, "READY");

    // And the Function CDK associated with it reads a key written afterwards,
    // through the association CDK's keyValueStore prop produced
    const data = scoped.cloudFrontKeyValueStore();
    const described = await data.describeKeyValueStore(
      new DescribeKeyValueStoreCommand({ KvsARN: store.arn }),
    );
    await data.putKey(
      new PutKeyCommand({
        KvsARN: store.arn,
        Key: "/old",
        Value: "/new",
        IfMatch: described.ETag,
      }),
    );

    const cff = scoped
      .cloudFront()
      .getCloudFrontFunctionByName("cdk-redirect-cff");
    assertNonNullable(cff);
    assertIdentical(cff.keyValueStore?.arn, store.arn);

    const result = await cff.handleViewerRequest(
      new Request("https://cdn.test/old"),
    );
    assertInstanceOf(result, Request);
    assertIdentical(new URL(result.url).pathname, "/new");
  });
});
