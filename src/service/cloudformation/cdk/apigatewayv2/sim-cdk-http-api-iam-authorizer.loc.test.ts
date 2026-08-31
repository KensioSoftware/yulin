import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
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
 * and calls its IAM-authorized route.
 */
import { serveSimAws } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { simAwsCallerHeaderName } from "../../../iam/request/sim-aws-caller-header.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

const accountId = "111111111111";
const reporterArn = `arn:aws:iam::${accountId}:role/Reporter`;

/**
 * Inline function code, as CDK packages Code.fromInline source. The handler
 * reports the caller the route's authorization attributed the request to.
 */
const ordersHandlerSource = `
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "text/plain" },
  body: event.requestContext.authorizer.iam.userArn,
});
`;

/**
 * HttpIamAuthorizer emits AuthorizationType alone on the Route. There is no
 * AWS::ApiGatewayV2::Authorizer Resource in the synthesised template at all,
 * which is why the Route property parser has to accept the type on its own.
 */
const cdkApp = `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "${accountId}", region: "eu-west-2" },
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
  authorizer: new authorizers.HttpIamAuthorizer(),
  integration: new integrations.HttpLambdaIntegration(
    "OrdersIntegration",
    ordersFunction,
  ),
});

new cdk.CfnOutput(stack, "ApiEndpoint", { value: httpApi.apiEndpoint });

app.synth();
`;

describe("Sim CDK HTTP API IAM authorizer local integration", () => {
  it("closes a CDK-deployed route to everyone IAM does not allow", async () => {
    // Given a CDK stack whose one route goes through an HttpIamAuthorizer.
    const simAws = new SimAws({
      defaultAccountId: accountId as SimAwsAccountId,
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

    // And a Role of the API's Account is allowed to invoke that one route.
    const iam = simAws.iam();
    await iam.createRole(
      new CreateRoleCommand({
        RoleName: "Reporter",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await iam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Reporter",
        PolicyName: "InvokeOrders",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "execute-api:Invoke",
            Resource:
              `arn:aws:execute-api:eu-west-2:${accountId}:` +
              `*/$default/GET/orders`,
          },
        }),
      }),
    );

    const srv = await serveSimAws({ simAws });

    try {
      const url = srv.localUrl(`${apiEndpoint}/orders`);

      // Then the deployed route is closed to a request carrying no identity.
      const anonymous = await fetch(url);
      assertResponseStatus(anonymous, 403, await describeResponse(anonymous));
      assertIdentical(await anonymous.text(), '{"message":"Forbidden"}');

      // And the allowed Role reaches the handler, which read its own ARN off
      // the IAM block the route's authorization put in the event.
      const reporter = await fetch(url, {
        headers: { [simAwsCallerHeaderName]: reporterArn },
      });
      assertResponseStatus(reporter, 200, await describeResponse(reporter));
      assertIdentical(await reporter.text(), reporterArn);
    } finally {
      await srv.close();
    }

    await simAws.backgroundTasksComplete();
  });
});
