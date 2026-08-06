/**
 * A user pool whose token trigger puts a tenant on every id token.
 */

import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

/**
 * The part of the PreTokenGeneration event this handler reads and writes.
 */
interface PreTokenGenerationEvent {
  readonly request: { readonly userAttributes: Record<string, string> };
  readonly response: object;
}

const simAws = new SimAws();
const lambda = simAws.lambda();
const cognito = simAws.cognitoIdentityProvider();

// The trigger reads the user's email and puts the tenant it belongs to on the
// token, along with the groups that tenant's users get.
await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "pre-token",
    Role: "arn:aws:iam::888888888888:role/PreTokenRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: PreTokenGenerationEvent) => {
        const email = event.request.userAttributes["email"] ?? "";

        return {
          ...event,
          response: {
            claimsOverrideDetails: {
              claimsToAddOrOverride: { tenantId: email.split("@", 2)[1] ?? "" },
              claimsToSuppress: ["email"],
              groupOverrideDetails: { groupsToOverride: ["tenant-admin"] },
            },
          },
        };
      }),
    },
  }),
);

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    LambdaConfig: {
      PreTokenGeneration:
        "arn:aws:lambda:us-east-1:888888888888:function:pre-token",
    },
  }),
);

await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "pre-token",
    StatementId: "AllowCognito",
    Action: "lambda:InvokeFunction",
    Principal: "cognito-idp.amazonaws.com",
    SourceArn: pool.UserPool?.Arn,
  }),
);

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: pool.UserPool?.Id,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
  }),
);

await cognito.adminCreateUser(
  new AdminCreateUserCommand({
    UserPoolId: pool.UserPool?.Id,
    Username: "alice",
    UserAttributes: [{ Name: "email", Value: "alice@acme.example" }],
  }),
);
await cognito.adminSetUserPassword(
  new AdminSetUserPasswordCommand({
    UserPoolId: pool.UserPool?.Id,
    Username: "alice",
    Password: "Sup3rSecretPassw0rd!",
    Permanent: true,
  }),
);

const signedIn = await cognito.adminInitiateAuth(
  new AdminInitiateAuthCommand({
    UserPoolId: pool.UserPool?.Id,
    ClientId: appClient.UserPoolClient?.ClientId,
    AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecretPassw0rd!" },
  }),
);

// The id token carries the claim the handler added, and not the one it
// suppressed. It verifies against the pool's JWKS unchanged.
const [, claims] = (signedIn.AuthenticationResult?.IdToken ?? "").split(".");
const payload = JSON.parse(
  Buffer.from(claims ?? "", "base64url").toString("utf8"),
) as Record<string, unknown>;

console.log(payload["tenantId"]); // "acme.example"
console.log(payload["email"]); // undefined
console.log(payload["cognito:groups"]); // ["tenant-admin"]
