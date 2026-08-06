/**
 * A user pool that auto-confirms its users and writes each one to DynamoDB.
 */

import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  CreateTableCommand,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

/**
 * The parts of the two sign-up events these handlers read.
 */
interface SignUpTriggerEvent {
  readonly userName: string;
  readonly request: { readonly userAttributes: Record<string, string> };
  readonly response: {
    autoConfirmUser?: boolean;
    autoVerifyEmail?: boolean;
  };
}

const simAws = new SimAws();
const lambda = simAws.lambda();
const cognito = simAws.cognitoIdentityProvider();

await simAws.dynamoDb().createTable(
  new CreateTableCommand({
    TableName: "users",
    KeySchema: [{ AttributeName: "sub", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "sub", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);

// The execution role is what the handler's own writes are authorized as, so a
// missing grant fails the confirmation rather than writing nothing.
const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "SignUpTriggerRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "SignUpTriggerRole",
    PolicyName: "WriteUsers",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "dynamodb:PutItem",
        Resource: `arn:aws:dynamodb:${simAws.defaultRegionName}:${simAws.defaultAccountId}:table/users`,
      },
    }),
  }),
);

// Anyone on the domain the pool is for skips confirmation, and their address
// counts as verified without a code ever being answered.
await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "pre-sign-up",
    Role: role.Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SignUpTriggerEvent) => {
        const email = event.request.userAttributes["email"] ?? "";

        if (email.endsWith("@example.com")) {
          event.response.autoConfirmUser = true;
          event.response.autoVerifyEmail = true;
        }

        return event;
      }),
    },
  }),
);

// The confirmed user gets a row of its own, keyed on the sub Cognito
// allocated rather than on the username.
await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "post-confirmation",
    Role: role.Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput(async (event: SignUpTriggerEvent) => {
        await simAws.dynamoDb().putItem(
          new PutItemCommand({
            TableName: "users",
            Item: {
              sub: { S: event.request.userAttributes["sub"] ?? "" },
              email: { S: event.request.userAttributes["email"] ?? "" },
              username: { S: event.userName },
            },
          }),
        );

        return event;
      }),
    },
  }),
);

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    LambdaConfig: {
      PreSignUp: `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:pre-sign-up`,
      PostConfirmation: `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:post-confirmation`,
    },
  }),
);

for (const functionName of ["pre-sign-up", "post-confirmation"]) {
  await lambda.addPermission(
    new AddPermissionCommand({
      FunctionName: functionName,
      StatementId: "AllowCognito",
      Action: "lambda:InvokeFunction",
      Principal: "cognito-idp.amazonaws.com",
      SourceArn: pool.UserPool?.Arn,
    }),
  );
}

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: pool.UserPool?.Id,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
  }),
);

const signedUp = await cognito.signUp(
  new SignUpCommand({
    ClientId: appClient.UserPoolClient?.ClientId,
    Username: "alice",
    Password: "Sup3rSecret!",
    UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
  }),
);

// The pre sign-up handler confirmed the user, so no ConfirmSignUp call is
// needed and the post confirmation handler has already run.
console.log(signedUp.UserConfirmed); // true

const written = await simAws.dynamoDb().getItem(
  new GetItemCommand({
    TableName: "users",
    Key: { sub: { S: signedUp.UserSub ?? "" } },
  }),
);

console.log(written.Item?.["email"]?.S); // "alice@example.com"
