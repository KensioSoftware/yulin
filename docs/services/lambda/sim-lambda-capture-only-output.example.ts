/**
 * Recording what a handler prints without printing it again.
 */

import { FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "user",
    Role: "arn:aws:iam::111111111111:role/UserRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(() => {
        // What AWS Lambda Powertools' Metrics writes for every metric it
        // counts, once per request.
        process.stdout.write(
          `${JSON.stringify({ service: "user", UserRequest: 1 })}\n`,
        );

        return { statusCode: 200 };
      }),
    },
  }),
);

// The test run's own console stays clean from here on.
simAws.lambda().output().captureOnly();

await simAws.lambda().invoke(new InvokeCommand({ FunctionName: "user" }));

// The log group holds the line, as it did before.
const found = await simAws
  .logs()
  .filterLogEvents(
    new FilterLogEventsCommand({ logGroupName: "/aws/lambda/user" }),
  );

console.log(found.events?.[0]?.message);
