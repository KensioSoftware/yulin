/**
 * Creating a CloudFront key value store and writing keys to it.
 */

import { CreateKeyValueStoreCommand } from "@aws-sdk/client-cloudfront";
import {
  GetKeyCommand,
  UpdateKeysCommand,
} from "@aws-sdk/client-cloudfront-keyvaluestore";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// The CloudFront client owns the store itself.
const created = await simAws
  .cloudFront()
  .keyValueStores()
  .createKeyValueStore(
    new CreateKeyValueStoreCommand({
      Name: "redirects",
      Comment: "Where old paths go",
    }),
  );

const kvsArn = created.KeyValueStore.ARN;

// The key value store client owns the data, and addresses the store by ARN.
// Every write carries the current ETag, which the previous write returns.
const written = await simAws.cloudFrontKeyValueStore().updateKeys(
  new UpdateKeysCommand({
    KvsARN: kvsArn,
    IfMatch: created.ETag,
    Puts: [
      { Key: "/old-page", Value: "/new-page" },
      { Key: "/legacy", Value: "/current" },
    ],
  }),
);

console.log(written.ItemCount); // 2

const read = await simAws
  .cloudFrontKeyValueStore()
  .getKey(new GetKeyCommand({ KvsARN: kvsArn, Key: "/old-page" }));

console.log(read.Value); // /new-page
