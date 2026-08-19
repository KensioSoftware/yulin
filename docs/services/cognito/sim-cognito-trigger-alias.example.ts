/**
 * A user pool whose PreSignUp trigger names a Lambda alias, so sign-ups run the
 * version the alias points at.
 */

import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  AddPermissionCommand,
  CreateAliasCommand,
  CreateFunctionCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();
const cognito = simAws.cognitoIdentityProvider();
const triggerArn = `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:auth-trigger`;

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "auth-trigger",
    Role: `arn:aws:iam::${simAws.defaultAccountId}:role/TriggerRole`,
    Code: {
      ZipFile: makeLambdaZipFileInput((event, context) => {
        console.log(context.functionVersion); // "1", the version behind `live`

        // A trigger hands the event back, changed or not.
        return event;
      }),
    },
  }),
);

const published = await lambda.publishVersion(
  new PublishVersionCommand({ FunctionName: "auth-trigger" }),
);

await lambda.createAlias(
  new CreateAliasCommand({
    FunctionName: "auth-trigger",
    Name: "live",
    FunctionVersion: published.Version,
  }),
);

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    LambdaConfig: { PreSignUp: `${triggerArn}:live` },
  }),
);

await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "auth-trigger",
    Qualifier: "live",
    StatementId: "AllowCognito",
    Action: "lambda:InvokeFunction",
    Principal: "cognito-idp.amazonaws.com",
    SourceArn: pool.UserPool!.Arn!,
  }),
);

const client = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: pool.UserPool!.Id!,
    ClientName: "web",
  }),
);

await cognito.signUp(
  new SignUpCommand({
    ClientId: client.UserPoolClient!.ClientId!,
    Username: "alice",
    Password: "Sup3rSecret!",
  }),
);
