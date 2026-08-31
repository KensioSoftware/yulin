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
 * template file, then serves the deployed REST API over real localhost HTTP
 * and calls it through the authorizer the stack deployed.
 */
import { serveSimAws } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

/**
 * The authorizer function, which admits one token and passes a tenant on.
 *
 * It answers the policy every REST API authorizer answers, allowing exactly
 * the method it was asked about.
 */
const authorizerSource = `
exports.handler = async (event) => {
  if (event.authorizationToken !== "Bearer valid") {
    return { errorMessage: "Unauthorized" };
  }

  return {
    principalId: "user-6",
    context: { tenant: "acme" },
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Allow",
          Resource: event.methodArn,
        },
      ],
    },
  };
};
`;

/**
 * The method's own handler, reporting what the authorizer passed on to it.
 */
const ordersHandlerSource = `
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "text/plain" },
  body: event.requestContext.authorizer.principalId
    + " " + event.requestContext.authorizer.tenant,
});
`;

/**
 * `resultsCacheTtl` is zero because holding a decision is a separate piece of
 * work, and CDK defaults a TokenAuthorizer to five minutes.
 */
const cdkApp = `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";

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

const api = new apigw.RestApi(stack, "OrdersApi", { restApiName: "orders" });

const authorizer = new apigw.TokenAuthorizer(stack, "SessionAuthorizer", {
  handler: authorizerFunction,
  identitySource: apigw.IdentitySource.header("Authorization"),
  resultsCacheTtl: cdk.Duration.seconds(0),
});

api.root
  .addResource("orders")
  .addMethod("GET", new apigw.LambdaIntegration(ordersFunction), {
    authorizer,
  });

new cdk.CfnOutput(stack, "ApiUrl", { value: api.url });

app.synth();
`;

describe("Sim CDK REST API TOKEN authorizer local integration", () => {
  it("gates a CDK-deployed method with a CDK-deployed authorizer", async () => {
    // Given a CDK stack whose one method goes through a TokenAuthorizer
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

    const apiUrl = stack.outputs.get("ApiUrl")?.value;
    assertTypeString(apiUrl);

    const srv = await serveSimAws({ simAws });

    try {
      const url = srv.localUrl(`${apiUrl}orders`);

      // Then a request carrying the token the authorizer admits reaches the
      // handler, with the context the authorizer passed on
      const admitted = await fetch(url, {
        headers: { authorization: "Bearer valid" },
      });
      assertResponseStatus(admitted, 200, await describeResponse(admitted));
      assertIdentical(await admitted.text(), "user-6 acme");

      // And one carrying a token it refuses gets a 401
      const refused = await fetch(url, {
        headers: { authorization: "Bearer stale" },
      });
      assertResponseStatus(refused, 401, await describeResponse(refused));

      // And one carrying nothing never reaches the authorizer at all
      const anonymous = await fetch(url);
      assertResponseStatus(anonymous, 401, await describeResponse(anonymous));
    } finally {
      await srv.close();
    }
  });
});
