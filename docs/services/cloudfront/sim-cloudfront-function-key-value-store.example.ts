/**
 * Reading a key value store from a CloudFront Function.
 */

import {
  CreateFunctionCommand,
  CreateKeyValueStoreCommand,
} from "@aws-sdk/client-cloudfront";
import {
  DescribeKeyValueStoreCommand,
  PutKeyCommand,
} from "@aws-sdk/client-cloudfront-keyvaluestore";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const created = await simAws
  .cloudFront()
  .keyValueStores()
  .createKeyValueStore(new CreateKeyValueStoreCommand({ Name: "redirects" }));

const kvsArn = created.KeyValueStore.ARN;
const data = simAws.cloudFrontKeyValueStore();

const described = await data.describeKeyValueStore(
  new DescribeKeyValueStoreCommand({ KvsARN: kvsArn }),
);

await data.putKey(
  new PutKeyCommand({
    KvsARN: kvsArn,
    Key: "/old-page",
    Value: "/new-page",
    IfMatch: described.ETag,
  }),
);

// The Function names the store it may read. It gets `cf` from the one import
// JS 2.0 has, and the read is awaited, so the handler is async.
await simAws.cloudFront().createFunction(
  new CreateFunctionCommand({
    Name: "redirect-cff",
    FunctionConfig: {
      Comment: "Redirects from a key value store",
      Runtime: "cloudfront-js-2.0",
      KeyValueStoreAssociations: {
        Quantity: 1,
        Items: [{ KeyValueStoreARN: kvsArn }],
      },
    },
    FunctionCode: Buffer.from(`
      import cf from "cloudfront";

      async function handler(event) {
        const request = event.request;

        if (await cf.kvs().exists(request.uri)) {
          const target = await cf.kvs().get(request.uri);

          return {
            statusCode: 302,
            statusDescription: "Found",
            headers: { location: { value: target } },
          };
        }

        return request;
      }
    `),
  }),
);

const cff = simAws.cloudFront().getCloudFrontFunctionByName("redirect-cff");

const redirected = await cff!.handleViewerRequest(
  new Request("https://cdn.test/old-page"),
);

console.log((redirected as Response).status); // 302
console.log((redirected as Response).headers.get("location")); // /new-page
