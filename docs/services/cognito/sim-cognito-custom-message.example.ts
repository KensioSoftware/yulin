/**
 * A CustomMessage trigger writing the wording of a verification message.
 */

import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

/**
 * The part of the CustomMessage event this handler reads and writes.
 */
interface CustomMessageEvent {
  readonly triggerSource: string;
  readonly request: { readonly codeParameter: string };
  response: {
    emailSubject?: string;
    emailMessage?: string;
  };
}

const simAws = new SimAws();
const lambda = simAws.lambda();
const cognito = simAws.cognitoIdentityProvider();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "custom-message",
    Role: "arn:aws:iam::888888888888:role/CustomMessageRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: CustomMessageEvent) => {
        if (event.triggerSource === "CustomMessage_SignUp") {
          event.response.emailSubject = "Welcome to Acme";
          event.response.emailMessage =
            `Your code is ${event.request.codeParameter}. ` +
            `It is good for one sign-up.`;
        }

        return event;
      }),
    },
  }),
);

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    AutoVerifiedAttributes: ["email"],
    LambdaConfig: {
      CustomMessage:
        "arn:aws:lambda:us-east-1:888888888888:function:custom-message",
    },
  }),
);
const userPoolId = pool.UserPool!.Id!;

await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "custom-message",
    StatementId: "AllowCognito",
    Action: "lambda:InvokeFunction",
    Principal: "cognito-idp.amazonaws.com",
    SourceArn: pool.UserPool?.Arn,
  }),
);

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
  }),
);

await cognito.signUp(
  new SignUpCommand({
    ClientId: appClient.UserPoolClient!.ClientId!,
    Username: "alice",
    Password: "Sup3rSecret!",
    UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
  }),
);

const [message] = cognito.userPool(userPoolId).sentMessages();

console.log(message?.subject); // "Welcome to Acme"

// The code parameter the handler wrote carries the real code.
const code = cognito.userPool(userPoolId).confirmationCode("alice")!;

console.log(message?.body.startsWith(`Your code is ${code}.`)); // true
