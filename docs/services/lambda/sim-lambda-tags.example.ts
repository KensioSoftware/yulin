/**
 * Tagging a simulated Lambda function and reading its tags back.
 */

import {
  CreateFunctionCommand,
  ListTagsCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

const { FunctionArn } = await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: "arn:aws:iam::111111111111:role/OrdersRole",
    Code: { ZipFile: makeLambdaZipFileInput(() => "handled") },
    Tags: { team: "payments" },
  }),
);

await lambda.tagResource(
  new TagResourceCommand({ Resource: FunctionArn, Tags: { tier: "gold" } }),
);
await lambda.untagResource(
  new UntagResourceCommand({ Resource: FunctionArn, TagKeys: ["team"] }),
);

const { Tags } = await lambda.listTags(
  new ListTagsCommand({ Resource: FunctionArn }),
);
console.log(Tags); // { tier: "gold" }

await simAws.backgroundTasksComplete();
