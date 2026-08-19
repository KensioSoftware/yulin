/**
 * Publishing a simulated Lambda function version, pointing an alias at it, and
 * invoking through the alias.
 */

import {
  CreateAliasCommand,
  CreateFunctionCommand,
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
