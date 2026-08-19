/**
 * Gating a REST API method with a Cognito user pool authorizer.
 *
 * The authorizer verifies the token against the keys the pool publishes, and
 * the token's own claims reach the handler under `requestContext.authorizer`.
 */

import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";
import { simRestApiLambdaProxyFactory } from "@kensio/yulin/apigateway";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const UserPoolId = pool.UserPool!.Id!;

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
  }),
);
const ClientId = appClient.UserPoolClient!.ClientId!;

await cognito.adminCreateUser(
  new AdminCreateUserCommand({ UserPoolId, Username: "ada" }),
);
await cognito.adminSetUserPassword(
  new AdminSetUserPasswordCommand({
    UserPoolId,
    Username: "ada",
    Password: "Correct-horse-1",
    Permanent: true,
  }),
);

const restApi = await simRestApiLambdaProxyFactory.make(
  {
    resourcePaths: ["/orders"],
    cognitoUserPoolArns: [pool.UserPool!.Arn!],
    handler: (event) => ({
      statusCode: 200,
      headers: { "content-type": "text/plain" },
      body: `orders for ${
        event.requestContext.authorizer?.claims?.["cognito:username"] ??
        "nobody"
      }`,
    }),
  },
  simAws,
);

const signedIn = await cognito.adminInitiateAuth(
  new AdminInitiateAuthCommand({
    UserPoolId,
    ClientId,
    AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "ada", PASSWORD: "Correct-horse-1" },
  }),
);
const idToken = signedIn.AuthenticationResult!.IdToken!;

const srv = await serveSimAws({ simAws });
const url = srv.localUrl(`${restApi.invokeUrl("prod")}/orders`);

const anonymous = await fetch(url);

console.log(anonymous.status);
// 401

const authorized = await fetch(url, { headers: { authorization: idToken } });

console.log(await authorized.text());
// "orders for ada"

// Advancing the simulation's clock past the token's expiry closes the method
// to the same token, with nothing reissued.
await simAws.clock().advanceBy({ hours: 2 });

const expired = await fetch(url, { headers: { authorization: idToken } });

console.log(expired.status);
// 401

await srv.close();
