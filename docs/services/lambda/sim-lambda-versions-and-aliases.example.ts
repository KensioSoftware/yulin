/**
 * Publishing a simulated Lambda function version, pointing an alias at it,
 * invoking through the alias, and granting a permission on the alias alone.
 */

import {
  AddPermissionCommand,
  CreateAliasCommand,
  CreateFunctionCommand,
  GetPolicyCommand,
  InvokeCommand,
  ListVersionsByFunctionCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: "arn:aws:iam::111111111111:role/OrdersRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((_event, context) => ({
        ranAs: context.functionVersion,
      })),
    },
  }),
);

const published = await lambda.publishVersion(
  new PublishVersionCommand({ FunctionName: "orders" }),
);
console.log(published.Version);
console.log(published.FunctionArn);

await lambda.createAlias(
  new CreateAliasCommand({
    FunctionName: "orders",
    Name: "live",
    FunctionVersion: published.Version,
  }),
);

const invoked = await lambda.invoke(
  new InvokeCommand({ FunctionName: "orders", Qualifier: "live" }),
);
console.log(invoked.ExecutedVersion);

const versions = await lambda.listVersionsByFunction(
  new ListVersionsByFunctionCommand({ FunctionName: "orders" }),
);
console.log(versions.Versions.map((version) => version.Version));

await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "orders",
    Qualifier: "live",
    StatementId: "AllowReporting",
    Action: "lambda:InvokeFunction",
    Principal: "222222222222",
  }),
);

// The statements granted on the alias, and on nothing else.
const aliasPolicy = await lambda.getPolicy(
  new GetPolicyCommand({ FunctionName: "orders", Qualifier: "live" }),
);
console.log(aliasPolicy.Policy);
