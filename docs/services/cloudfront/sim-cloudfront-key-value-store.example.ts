/**
 * Creating a CloudFront key value store and writing keys to it.
 */

import { CreateKeyValueStoreCommand } from "@aws-sdk/client-cloudfront";
import {
  DescribeKeyValueStoreCommand,
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
const data = simAws.cloudFrontKeyValueStore();

// The key value store client owns the data, and addresses the store by ARN.
// Every write carries an ETag, and it is this API's own: the one the
// CloudFront client returned above versions the resource, not the keys.
const described = await data.describeKeyValueStore(
  new DescribeKeyValueStoreCommand({ KvsARN: kvsArn }),
);

const written = await data.updateKeys(
  new UpdateKeysCommand({
    KvsARN: kvsArn,
    IfMatch: described.ETag,
    Puts: [
      { Key: "/old-page", Value: "/new-page" },
      { Key: "/legacy", Value: "/current" },
    ],
  }),
);

console.log(written.ItemCount); // 2

const read = await data.getKey(
  new GetKeyCommand({ KvsARN: kvsArn, Key: "/old-page" }),
);

console.log(read.Value); // /new-page
