/**
 * Giving a simulated Lambda function the address of an external dependency.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "rates",
    Role: "arn:aws:iam::111111111111:role/RatesRole",
    Environment: {
      Variables: {
        TABLE_NAME: "rates",
        CACHE_URL: "redis://127.0.0.1:6379",
      },
    },
    Code: {
      ZipFile: makeLambdaZipFileInput(() => ({
        tableName: process.env["TABLE_NAME"],
        cacheUrl: process.env["CACHE_URL"],
      })),
    },
  }),
);

const output = await lambda.invoke(
  new InvokeCommand({ FunctionName: "rates" }),
);

if (output.Payload === undefined) throw new Error("No invoke payload");

console.log(Buffer.from(output.Payload).toString());
// {"tableName":"rates","cacheUrl":"redis://127.0.0.1:6379"}
