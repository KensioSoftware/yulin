/**
 * A PostConfirmation trigger that runs on a federated user's first sign-in.
 */

import {
  CreateIdentityProviderCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  CreateUserPoolDomainCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

/**
 * The part of the PostConfirmation event this handler reads.
 */
interface PostConfirmationEvent {
  readonly triggerSource: string;
  readonly userName: string;
}

const written: string[] = [];

// A record is written here. A deployed handler writes it to DynamoDB.
const postConfirmation = (event: PostConfirmationEvent): unknown => {
  written.push(`${event.triggerSource} ${event.userName}`);

  return event;
};

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
const lambda = simAws.lambda();
const cognito = simAws.cognitoIdentityProvider();
const callbackUrl = "https://www.example.com/user/callback";

// The function comes first, because the pool names it by ARN.
const functionArn =
  `arn:aws:lambda:eu-west-2:${simAws.defaultAccountId}` +
  `:function:post-confirmation`;
await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "post-confirmation",
    Role: `arn:aws:iam::${simAws.defaultAccountId}:role/TriggerRole`,
    Code: { ZipFile: makeLambdaZipFileInput(postConfirmation) },
  }),
);

const created = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    LambdaConfig: { PostConfirmation: functionArn },
  }),
);
const userPoolId = created.UserPool?.Id ?? "";

// The permission a CDK `addTrigger` emits, which lets Cognito invoke it.
await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "post-confirmation",
    StatementId: "AllowCognito",
    Action: "lambda:InvokeFunction",
    Principal: "cognito-idp.amazonaws.com",
    SourceArn: created.UserPool?.Arn,
  }),
);

await cognito.createIdentityProvider(
  new CreateIdentityProviderCommand({
    UserPoolId: userPoolId,
    ProviderName: "Google",
    ProviderType: "Google",
    ProviderDetails: {
      client_id: "google-client-id",
      client_secret: "google-client-secret",
      authorize_scopes: "openid email",
    },
    AttributeMapping: { email: "email" },
  }),
);

const client = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    AllowedOAuthFlowsUserPoolClient: true,
    AllowedOAuthFlows: ["code"],
    AllowedOAuthScopes: ["openid", "email"],
    CallbackURLs: [callbackUrl],
    SupportedIdentityProviders: ["Google"],
  }),
);

await cognito.createUserPoolDomain(
  new CreateUserPoolDomainCommand({
    UserPoolId: userPoolId,
    Domain: "myapp-login",
  }),
);

const pool = cognito.userPool(userPoolId);

pool.auth.identityProviders.require("Google").signInAs({
  Subject: "108412093487519382745",
  Claims: { email: "someone@example.com" },
});

const authorize = {
  response_type: "code",
  client_id: client.UserPoolClient?.ClientId ?? "",
  redirect_uri: callbackUrl,
  identity_provider: "Google",
};

// The first sign-in creates the pool's user for the subject.
await cognito.hostedAuthorize(pool, authorize);
console.log(written);
// ["PostConfirmation_ConfirmSignUp Google_108412093487519382745"]

// The second reaches the same user, and the sign-up triggers stay unfired.
await cognito.hostedAuthorize(pool, authorize);
console.log(written.length); // 1
