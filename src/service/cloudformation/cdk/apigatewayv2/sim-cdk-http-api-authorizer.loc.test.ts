import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { assertIdentical, assertTypeString } from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file, then serves the deployed HTTP API over real localhost HTTP
 * and signs in against the deployed user pool to call it.
 */
import { serveSimAws } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

/**
 * Inline function code, as CDK packages Code.fromInline source. The handler
 * reports the username the authorizer's claims carry, so the response says
 * which token reached it.
 */
const ordersHandlerSource = `
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "text/plain" },
  body: event.requestContext.authorizer.jwt.claims.username,
});
`;

/**
 * The app client is passed to the authorizer explicitly. Left to itself,
 * HttpUserPoolAuthorizer adds a client of its own with CDK's defaults, which
 * emit the OAuth properties simulated Cognito refuses.
 */
const cdkApp = `
import * as cdk from "aws-cdk-lib/core";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const pool = new cognito.UserPool(stack, "Pool");
const client = pool.addClient("Client", {
  disableOAuth: true,
  authFlows: { adminUserPassword: true },
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
  authorizer: new authorizers.HttpUserPoolAuthorizer("PoolAuthorizer", pool, {
    userPoolClients: [client],
  }),
  integration: new integrations.HttpLambdaIntegration(
    "OrdersIntegration",
    ordersFunction,
  ),
});

new cdk.CfnOutput(stack, "ApiEndpoint", { value: httpApi.apiEndpoint });
new cdk.CfnOutput(stack, "PoolId", { value: pool.userPoolId });
new cdk.CfnOutput(stack, "ClientId", { value: client.userPoolClientId });

app.synth();
`;

describe("Sim CDK HTTP API JWT authorizer local integration", () => {
  it("protects a CDK-deployed route with a CDK-deployed user pool", async () => {
    // Given a CDK stack with a user pool, an app client, and an HTTP API whose
    // one route goes through an HttpUserPoolAuthorizer trusting that pool.
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
    const userPoolId = stack.outputs.get("PoolId")?.value;
    const clientId = stack.outputs.get("ClientId")?.value;
    assertTypeString(apiEndpoint);
    assertTypeString(userPoolId);
    assertTypeString(clientId);

    // And a user of the deployed pool signs in.
    const cognito = simAws.cognitoIdentityProvider();
    await cognito.adminCreateUser(
      new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "ada" }),
    );
    await cognito.adminSetUserPassword(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: "ada",
        Password: "Correct-horse-1",
        Permanent: true,
      }),
    );
    const signedIn = await cognito.adminInitiateAuth(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "ada", PASSWORD: "Correct-horse-1" },
      }),
    );
    // Asserted rather than defaulted, so a sign-in that answered a challenge
    // instead of a token fails here rather than as a puzzling 401 below.
    const accessToken = signedIn.AuthenticationResult?.AccessToken;
    assertTypeString(accessToken);

    const srv = await serveSimAws({ simAws });

    try {
      const url = srv.localUrl(`${apiEndpoint}/orders`);

      // Then the deployed route is closed to a request carrying no token.
      const anonymous = await fetch(url);
      assertIdentical(anonymous.status, 401);
      assertIdentical(anonymous.headers.get("www-authenticate"), "Bearer");
      assertIdentical(await anonymous.text(), '{"message":"Unauthorized"}');

      // And the access token from that sign-in reaches the handler, which
      // read the username off the claims the authorizer accepted.
      const authorized = await fetch(url, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      assertIdentical(authorized.status, 200);
      assertIdentical(await authorized.text(), "ada");

      // And advancing the simulation's clock past the token's expiry closes
      // the route to the same token, with nothing reissued.
      await simAws.clock().advanceBy({ hours: 2 });

      const expired = await fetch(url, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      assertIdentical(expired.status, 401);
    } finally {
      await srv.close();
    }

    await simAws.backgroundTasksComplete();
  });
});
