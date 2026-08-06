/**
 * A user pool that runs a PreAuthentication trigger on every sign-in.
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
 * The part of the PreAuthentication event this handler reads.
 */
interface PreAuthenticationEvent {
  readonly request: { readonly userAttributes: Record<string, string> };
}

const simAws = new SimAws();
const lambda = simAws.lambda();
const cognito = simAws.cognitoIdentityProvider();

// The trigger turns away anyone who is not on the domain the pool is for, and
// hands the event back otherwise, as every trigger handler has to.
await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "pre-auth",
    Role: "arn:aws:iam::888888888888:role/PreAuthRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: PreAuthenticationEvent) => {
        const email = event.request.userAttributes["email"] ?? "";

        if (!email.endsWith("@example.com")) {
          throw new Error("Only example.com may sign in");
        }

        return event;
      }),
    },
  }),
);

// The pool names the function by ARN. Nothing is resolved until a sign-in runs
// the trigger, so the pool can be created before the function exists.
const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    LambdaConfig: {
      PreAuthentication:
        "arn:aws:lambda:us-east-1:888888888888:function:pre-auth",
    },
  }),
);

// Cognito invokes the function as a service, so the function's resource policy
// has to admit it for this pool.
await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "pre-auth",
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
    Username: "mallory",
    UserAttributes: [{ Name: "email", Value: "mallory@elsewhere.test" }],
  }),
);
await cognito.adminSetUserPassword(
  new AdminSetUserPasswordCommand({
    UserPoolId: pool.UserPool?.Id,
    Username: "mallory",
    Password: "Sup3rSecretPassw0rd!",
    Permanent: true,
  }),
);

try {
  await cognito.adminInitiateAuth(
    new AdminInitiateAuthCommand({
      UserPoolId: pool.UserPool?.Id,
      ClientId: appClient.UserPoolClient?.ClientId,
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: "mallory",
        PASSWORD: "Sup3rSecretPassw0rd!",
      },
    }),
  );
} catch (error) {
  // The handler's own words, in the error real Cognito refuses the sign-in
  // with.
  console.log((error as Error).name); // "UserLambdaValidationException"
  console.log((error as Error).message);
  // "PreAuthentication failed with error Only example.com may sign in."
}
