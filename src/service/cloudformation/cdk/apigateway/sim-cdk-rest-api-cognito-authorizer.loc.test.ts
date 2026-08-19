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
 * template file, then serves the deployed REST API over real localhost HTTP
 * and signs in against the deployed user pool to call it.
 */
import { serveSimAws } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

/**
 * The method's handler, reporting the username off the claims the authorizer
 * accepted. A REST API puts them under `claims`, where an HTTP API nests them
 * under `jwt`.
 */
const ordersHandlerSource = `
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "text/plain" },
  body: event.requestContext.authorizer.claims["cognito:username"],
});
`;

/**
 * The app client is passed nothing but the flows the sign-in below needs.
 * Left to itself, CDK's defaults emit the OAuth properties simulated Cognito
 * refuses.
 */
const cdkApp = `
import * as cdk from "aws-cdk-lib/core";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";

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

const api = new apigw.RestApi(stack, "OrdersApi", { restApiName: "orders" });

const authorizer = new apigw.CognitoUserPoolsAuthorizer(stack, "PoolAuthorizer", {
  cognitoUserPools: [pool],
});

api.root
  .addResource("orders")
  .addMethod("GET", new apigw.LambdaIntegration(ordersFunction), {
    authorizer,
    authorizationType: apigw.AuthorizationType.COGNITO,
  });

new cdk.CfnOutput(stack, "ApiUrl", { value: api.url });
new cdk.CfnOutput(stack, "PoolId", { value: pool.userPoolId });
new cdk.CfnOutput(stack, "ClientId", { value: client.userPoolClientId });

app.synth();
`;

describe("Sim CDK REST API Cognito authorizer local integration", () => {
  it("gates a CDK-deployed method with a CDK-deployed user pool", async () => {
    // Given a CDK stack with a user pool, an app client, and a REST API whose
    // one method goes through a CognitoUserPoolsAuthorizer trusting that pool.
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
    const userPoolId = stack.outputs.get("PoolId")?.value;
    const clientId = stack.outputs.get("ClientId")?.value;
    assertTypeString(apiUrl);
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
    const idToken = signedIn.AuthenticationResult?.IdToken;
    assertTypeString(idToken);

    const srv = await serveSimAws({ simAws });

    try {
      const url = srv.localUrl(`${apiUrl}orders`);

      // Then the deployed method is closed to a request carrying no token.
      const anonymous = await fetch(url);
      assertIdentical(anonymous.status, 401);
      assertIdentical(await anonymous.text(), '{"message":"Unauthorized"}');

      // And the id token from that sign-in reaches the handler, which read
      // the username off the claims the authorizer accepted.
      const authorized = await fetch(url, {
        headers: { authorization: idToken },
      });
      assertIdentical(authorized.status, 200);
      assertIdentical(await authorized.text(), "ada");

      // And advancing the simulation's clock past the token's expiry closes
      // the method to the same token, with nothing reissued.
      await simAws.clock().advanceBy({ hours: 2 });

      const expired = await fetch(url, {
        headers: { authorization: idToken },
      });
      assertIdentical(expired.status, 401);
    } finally {
      await srv.close();
    }

    await simAws.backgroundTasksComplete();
  });
});
