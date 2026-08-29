/**
 * Reading a deployed CloudFront Function back.
 */

import {
  CreateFunctionCommand,
  DescribeFunctionCommand,
  GetFunctionCommand,
  ListFunctionsCommand,
} from "@aws-sdk/client-cloudfront";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCloudFront = simAws.cloudFront();

await simCloudFront.createFunction(
  new CreateFunctionCommand({
    Name: "beacon",
    FunctionConfig: {
      Comment: "Answers the analytics beacon",
      Runtime: "cloudfront-js-2.0",
    },
    FunctionCode: Buffer.from(`
      function handler(event) {
        return { statusCode: 204, statusDescription: "No Content" };
      }
    `),
  }),
);

// CloudFront publishes a new Function in the background.
await simAws.backgroundTasksComplete();

const listed = await simCloudFront.listFunctions(new ListFunctionsCommand({}));

// cloudfront-js-2.0
console.log(listed.FunctionList.Items[0]?.FunctionConfig.Runtime);

const described = await simCloudFront.describeFunction(
  new DescribeFunctionCommand({ Name: "beacon", Stage: "LIVE" }),
);

// Answers the analytics beacon
console.log(described.FunctionSummary.FunctionConfig.Comment);

const got = await simCloudFront.getFunction(
  new GetFunctionCommand({ Name: "beacon" }),
);

// The source the Function was created with.
console.log(Buffer.from(got.FunctionCode).toString());
