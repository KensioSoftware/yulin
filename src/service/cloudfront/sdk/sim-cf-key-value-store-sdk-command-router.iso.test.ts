import {
  CloudFrontClient,
  CreateKeyValueStoreCommand,
  DescribeKeyValueStoreCommand,
  ListKeyValueStoresCommand,
} from "@aws-sdk/client-cloudfront";
import {
  CloudFrontKeyValueStoreClient,
  DescribeKeyValueStoreCommand as DescribeKeyValueStoreDataCommand,
  GetKeyCommand,
  ListKeysCommand,
  PutKeyCommand,
} from "@aws-sdk/client-cloudfront-keyvaluestore";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSdk } from "../../../sdk/index.js";

describe("simulated key value store SDK Command routing", () => {
  it("round-trips a key value store through both intercepted clients", async () => {
    // Given the two clients AWS splits this across, both intercepted
    using simSdk = new SimSdk();
    const cloudFront = new CloudFrontClient({ region: "us-east-1" });
    const keyValueStore = new CloudFrontKeyValueStoreClient({
      region: "us-east-1",
    });
    simSdk.intercept(cloudFront);
    simSdk.intercept(keyValueStore);

    // When the CloudFront client creates the store
    const created = await cloudFront.send(
      new CreateKeyValueStoreCommand({ Name: "redirects" }),
    );
    assertNonNullable(created.KeyValueStore?.ARN);

    // And the key value store client writes to it, carrying the ETag from its
    // own describe rather than the one CloudFront just returned
    const described = await keyValueStore.send(
      new DescribeKeyValueStoreDataCommand({
        KvsARN: created.KeyValueStore.ARN,
      }),
    );
    assertNonNullable(described.ETag);

    await keyValueStore.send(
      new PutKeyCommand({
        KvsARN: created.KeyValueStore.ARN,
        Key: "/old",
        Value: "/new",
        IfMatch: described.ETag,
      }),
    );

    // Then the key written through one client is readable through the other's
    // store, because both reach the same simulated CloudFront
    const read = await keyValueStore.send(
      new GetKeyCommand({ KvsARN: created.KeyValueStore.ARN, Key: "/old" }),
    );
    assertIdentical(read.Value, "/new");

    const listed = await keyValueStore.send(
      new ListKeysCommand({ KvsARN: created.KeyValueStore.ARN }),
    );
    assertArrayLength(listed.Items ?? [], 1);
  });

  it("keeps the two DescribeKeyValueStore commands apart", async () => {
    // Given a store, and both clients intercepted
    using simSdk = new SimSdk();
    const cloudFront = new CloudFrontClient({ region: "us-east-1" });
    const keyValueStore = new CloudFrontKeyValueStoreClient({
      region: "us-east-1",
    });
    simSdk.intercept(cloudFront);
    simSdk.intercept(keyValueStore);

    const created = await cloudFront.send(
      new CreateKeyValueStoreCommand({ Name: "redirects" }),
    );
    assertNonNullable(created.KeyValueStore?.ARN);

    // When each client sends its own command of that name
    const resource = await cloudFront.send(
      new DescribeKeyValueStoreCommand({ Name: "redirects" }),
    );
    const data = await keyValueStore.send(
      new DescribeKeyValueStoreDataCommand({
        KvsARN: created.KeyValueStore.ARN,
      }),
    );

    // Then each answers with its own thing: the CloudFront client with the
    // resource, the data client with what is in it. The command names are the
    // same and do not collide, because routing resolves the service first.
    assertIdentical(resource.KeyValueStore?.Name, "redirects");
    assertIdentical(data.ItemCount, 0);
    assertIdentical(data.KvsARN, created.KeyValueStore.ARN);
  });

  it("lists stores created through the intercepted client", async () => {
    // Given a store created through an intercepted CloudFront client
    using simSdk = new SimSdk();
    const cloudFront = new CloudFrontClient({ region: "us-east-1" });
    simSdk.intercept(cloudFront);
    await cloudFront.send(new CreateKeyValueStoreCommand({ Name: "flags" }));

    // When the stores are listed through the same client
    const listed = await cloudFront.send(new ListKeyValueStoresCommand({}));

    // Then the store is there
    assertIdentical(listed.KeyValueStoreList?.Quantity, 1);
  });
});
