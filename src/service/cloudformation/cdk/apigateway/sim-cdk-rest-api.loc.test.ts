import { GetPolicyCommand } from "@aws-sdk/client-lambda";
import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
  assertTrue,
  assertTypeString,
  describeResponse,
} from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file, then serves the deployed REST API over real localhost HTTP.
 */
import { serveSimAws } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

/**
 * Inline function code, as CDK packages Code.fromInline source. The handler
 * reads the path the greedy proxy resource captured out of the payload format
 * 1.0 event.
 */
const ordersHandlerSource = `
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "text/plain" },
  body: event.httpMethod + " order " + (event.pathParameters?.proxy ?? "none"),
});
`;

const cdkApp = `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const ordersFunction = new lambda.Function(stack, "OrdersFunction", {
  functionName: "cdk-orders",
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline(${JSON.stringify(ordersHandlerSource)}),
});

const api = new apigw.LambdaRestApi(stack, "OrdersApi", {
  restApiName: "orders",
  handler: ordersFunction,
});

new cdk.CfnOutput(stack, "ApiUrl", { value: api.url });
new cdk.CfnOutput(stack, "StageName", { value: api.deploymentStage.stageName });

app.synth();
`;

describe("Sim CDK REST API deployment local integration", () => {
  it("serves a CDK-deployed LambdaRestApi over localhost", async () => {
    // Given a CDK stack with a LambdaRestApi in front of a Lambda function,
    // and a simulated AWS scoped to the Account and Region the stack names,
    // which is what CDK baked into the endpoint it publishes.
    const simAws = new SimAws({
      defaultAccountId: "111111111111",
      defaultRegionName: "eu-west-2",
    });
    const projectDirectory = new TemporaryDirectory();
    const cdkProject = new TestCdkProject({ projectDirectory });
    await cdkProject.writeCdkAppFile(cdkApp);

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the template into sim CloudFormation and serve it.
    const stack = await simAws
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    // Then the URL CDK publishes carries the API id and the stage segment, and
    // resolves through AWS::URLSuffix to the local hostname.
    const apiUrl = stack.outputs.get("ApiUrl")?.value;
    assertTypeString(apiUrl);
    assertIdentical(stack.outputs.get("StageName")?.value, "prod");
    assertStringIncludes(apiUrl, ".execute-api.eu-west-2.sim-aws.localhost/");
    assertStringIncludes(apiUrl, "/prod/");

    // And a request reaches the function through the ANY method on the
    // {proxy+} resource, with the rest of the path captured.
    const srv = await serveSimAws({ simAws });

    try {
      const read = await fetch(srv.localUrl(`${apiUrl}orders/YL-1`));
      assertResponseStatus(read, 200, await describeResponse(read));
      assertIdentical(read.headers.get("content-type"), "text/plain");
      assertIdentical(await read.text(), "GET order orders/YL-1");

      const write = await fetch(srv.localUrl(`${apiUrl}orders`), {
        method: "POST",
      });
      assertIdentical(await write.text(), "POST order orders");
    } finally {
      await srv.close();
    }

    // And the invocation was gated by the AWS::Lambda::Permission CDK pairs
    // with the method, which is deployed rather than skipped.
    const permissionResource = stack.resources.find(
      (resource) => resource.type === "AWS::Lambda::Permission",
    );
    assertNonNullable(permissionResource);
    assertFalse(permissionResource.skipped);

    const policy = await simAws
      .lambda()
      .getPolicy(new GetPolicyCommand({ FunctionName: "cdk-orders" }));
    assertStringIncludes(policy.Policy, "lambda:InvokeFunction");
    assertStringIncludes(policy.Policy, "apigateway.amazonaws.com");

    // And the AWS::ApiGateway::Account CDK writes beside a default RestApi is
    // recorded rather than deployed, which is what leaves the rest served.
    const accountResource = stack.resources.find(
      (resource) => resource.type === "AWS::ApiGateway::Account",
    );
    assertNonNullable(accountResource);
    assertTrue(accountResource.skipped);

    await simAws.backgroundTasksComplete();
  });
});
