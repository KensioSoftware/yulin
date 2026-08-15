/**
 * Pointing a simulated Lambda function at a dependency Yulin does not
 * simulate, alongside one it does.
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
        // Simulated by Yulin, reached with no network involved.
        TABLE_NAME: "rates",
        // Yours. A deployment points this at ElastiCache. A test points it
        // at whatever it wants the code to talk to instead.
        CACHE_URL: "redis://127.0.0.1:6379",
      },
    },
    Code: {
      ZipFile: makeLambdaZipFileInput(() => ({
        // Building a Redis client from the second value involves nothing of
        // Yulin's. It is an ordinary environment variable read.
        tableName: process.env["TABLE_NAME"],
        cacheUrl: process.env["CACHE_URL"],
      })),
    },
  }),
);

const output = await lambda.invoke(
  new InvokeCommand({ FunctionName: "rates" }),
);

if (output.Payload === undefined) throw new Error("No invoke Payload");
// {"tableName":"rates","cacheUrl":"redis://127.0.0.1:6379"}
console.log(Buffer.from(output.Payload).toString());
