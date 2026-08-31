import {
  assertIdentical,
  assertResponseStatus,
  assertTypeString,
  describeResponse,
} from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file, then serves the deployed HTTP API over real localhost HTTP
 * and calls it through the authorizer the stack deployed.
 */
import { serveSimAws } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

/**
 * The authorizer function, which admits one cookie and passes a tenant on.
 */
const authorizerSource = `
exports.handler = async (event) => ({
  isAuthorized: event.identitySource[0] === "session=valid",
  context: { tenant: "acme" },
});
`;

/**
 * The route's own handler, reporting what the authorizer passed on to it.
 */
const ordersHandlerSource = `
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "text/plain" },
  body: event.requestContext.authorizer.lambda.tenant,
});
`;

/**
 * `responseTypes` is passed explicitly. Left to itself, HttpLambdaAuthorizer
 * asks for an IAM response, which sets `payloadFormatVersion` to `1.0`, and
 * that authorizer event is not simulated.
 */
const cdkApp = `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const authorizerFunction = new lambda.Function(stack, "AuthorizerFunction", {
  functionName: "cdk-session-authorizer",
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline(${JSON.stringify(authorizerSource)}),
});

const ordersFunction = new lambda.Function(stack, "OrdersFunction", {
  functionName: "cdk-orders",
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline(${JSON.stringify(ordersHandlerSource)}),
});

const httpApi = new apigwv2.HttpApi(stack, "HttpApi", { apiName: "orders" });

httpApi.addRoutes({
  path: "/orders",
  methods: [apigwv2.HttpMethod.GET],
  authorizer: new authorizers.HttpLambdaAuthorizer(
    "SessionAuthorizer",
    authorizerFunction,
    {
      responseTypes: [authorizers.HttpLambdaResponseType.SIMPLE],
      identitySource: ["$request.header.cookie"],
    },
  ),
  integration: new integrations.HttpLambdaIntegration(
    "OrdersIntegration",
    ordersFunction,
  ),
});

new cdk.CfnOutput(stack, "ApiEndpoint", { value: httpApi.apiEndpoint });

app.synth();
`;

describe("Sim CDK HTTP API Lambda authorizer local integration", () => {
  it("protects a CDK-deployed route with a CDK-deployed authorizer", async () => {
    // Given a CDK stack whose one route goes through an HttpLambdaAuthorizer
    // answering the simple response format.
    const simAws = new SimAws({
      defaultAccountId: "111111111111",
      defaultRegionName: "eu-west-2",
    });
    const projectDirectory = new TemporaryDirectory();
    const cdkProject = new TestCdkProject({ projectDirectory });
    await cdkProject.writeCdkAppFile(cdkApp);

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the template into sim CloudFormation.
    const stack = await simAws
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    const apiEndpoint = stack.outputs.get("ApiEndpoint")?.value;
    assertTypeString(apiEndpoint);

    const srv = await serveSimAws({ simAws });

    try {
      const url = srv.localUrl(`${apiEndpoint}/orders`);

      // Then the deployed route is closed to a request carrying no cookie,
      // without the authorizer function being invoked at all.
      const anonymous = await fetch(url);
      assertResponseStatus(anonymous, 401, await describeResponse(anonymous));

      // And closed to a cookie the deployed authorizer refuses.
      const refused = await fetch(url, {
        headers: { cookie: "session=expired" },
      });
      assertResponseStatus(refused, 403, await describeResponse(refused));

      // And open to the one it accepts, whose context reached the handler.
      const admitted = await fetch(url, {
        headers: { cookie: "session=valid" },
      });
      assertResponseStatus(admitted, 200, await describeResponse(admitted));
      assertIdentical(await admitted.text(), "acme");
    } finally {
      await srv.close();
    }

    await simAws.backgroundTasksComplete();
  });
});
