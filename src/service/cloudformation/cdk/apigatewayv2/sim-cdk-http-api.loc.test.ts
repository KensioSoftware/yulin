import { GetPolicyCommand } from "@aws-sdk/client-lambda";
import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTypeString,
} from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file, then serves the deployed HTTP API over real localhost HTTP.
 */
import { serveSimAws } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

/**
 * Inline function code, as CDK packages Code.fromInline source. The handler
 * reads the path parameter the route captured out of the payload format 2.0
 * event.
 */
const ordersHandlerSource = `
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "text/plain" },
  body: "order " + (event.pathParameters?.orderId ?? "none"),
});
`;

/**
 * The route path the CDK app adds, kept out of the app source below because a
 * `{name}` route parameter inside a template literal reads as an interpolation
 * that lost its dollar sign.
 */
const orderRoutePath = "/orders/{orderId}";

const cdkApp = `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";

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

const httpApi = new apigwv2.HttpApi(stack, "HttpApi", { apiName: "orders" });

httpApi.addRoutes({
  path: ${JSON.stringify(orderRoutePath)},
  methods: [apigwv2.HttpMethod.GET],
  integration: new integrations.HttpLambdaIntegration(
    "OrdersIntegration",
    ordersFunction,
  ),
});

new cdk.CfnOutput(stack, "ApiUrl", { value: httpApi.url });
new cdk.CfnOutput(stack, "ApiEndpoint", { value: httpApi.apiEndpoint });

app.synth();
`;

describe("Sim CDK HTTP API deployment local integration", () => {
  it("serves a CDK-deployed HTTP API over localhost", async () => {
    // Given a CDK stack with an HttpApi routing to a Lambda function, and a
    // simulated AWS scoped to the Account and Region the stack names, which
    // is what CDK baked into the endpoint it publishes.
    const simAws = new SimAws({
      defaultAccountId: "111111111111" as SimAwsAccountId,
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

    // Then the two endpoint forms CDK publishes both name the deployed API:
    // `httpApi.url` resolves through AWS::URLSuffix to the local hostname,
    // and `apiEndpoint` is the real AWS one.
    const apiUrl = stack.outputs.get("ApiUrl")?.value;
    const apiEndpoint = stack.outputs.get("ApiEndpoint")?.value;
    assertTypeString(apiUrl);
    assertTypeString(apiEndpoint);
    assertStringIncludes(apiUrl, ".execute-api.eu-west-2.sim-aws.localhost/");
    assertStringIncludes(apiEndpoint, ".execute-api.eu-west-2.amazonaws.com");

    // And a request to either reaches the integration's function through the
    // route, with the path parameter the route captured.
    const srv = await serveSimAws({ simAws });

    try {
      const fromCdkUrl = await fetch(srv.localUrl(`${apiUrl}orders/YL-1`));
      assertIdentical(fromCdkUrl.status, 200);
      assertIdentical(fromCdkUrl.headers.get("content-type"), "text/plain");
      assertIdentical(await fromCdkUrl.text(), "order YL-1");

      const fromApiEndpoint = await fetch(
        srv.localUrl(`${apiEndpoint}/orders/YL-2`),
      );
      assertIdentical(fromApiEndpoint.status, 200);
      assertIdentical(await fromApiEndpoint.text(), "order YL-2");
    } finally {
      srv.close();
    }

    // And the invocation was gated by the AWS::Lambda::Permission CDK pairs
    // with the integration, which is deployed rather than skipped.
    const permissionResource = stack.resources
      .values()
      .find((resource) => resource.type === "AWS::Lambda::Permission");
    assertNonNullable(permissionResource);
    assertFalse(permissionResource.skipped);

    const policy = await simAws
      .lambda()
      .getPolicy(new GetPolicyCommand({ FunctionName: "cdk-orders" }));
    assertStringIncludes(policy.Policy, "lambda:InvokeFunction");
    assertStringIncludes(policy.Policy, "apigateway.amazonaws.com");

    await simAws.backgroundTasksComplete();
  });
});
