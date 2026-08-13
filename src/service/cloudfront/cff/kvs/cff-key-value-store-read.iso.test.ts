import {
  CreateFunctionCommand,
  CreateKeyValueStoreCommand,
} from "@aws-sdk/client-cloudfront";
import {
  DescribeKeyValueStoreCommand,
  PutKeyCommand,
} from "@aws-sdk/client-cloudfront-keyvaluestore";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { makeCffFunctionCodeInput } from "../function-code-input/cff-function-code-input.js";
import type { CloudFrontFunction as CloudFrontFunctionType } from "../../typings/cloudfront-functions.namespace.js";

// The `cf` global a bound handler reads is declared by the CloudFront Function
// globals, which a consumer imports for the same reason.
import "../../globals.js";

/**
 * A store holding one redirect, and the ARN a Function associates it by.
 */
async function storeWithRedirect(simAws: SimAws): Promise<string> {
  const created = await simAws
    .cloudFront()
    .keyValueStores()
    .createKeyValueStore(new CreateKeyValueStoreCommand({ Name: "redirects" }));

  const data = simAws.cloudFrontKeyValueStore();
  const described = await data.describeKeyValueStore(
    new DescribeKeyValueStoreCommand({ KvsARN: created.KeyValueStore.ARN }),
  );

  await data.putKey(
    new PutKeyCommand({
      KvsARN: created.KeyValueStore.ARN,
      Key: "/old",
      Value: "/new",
      IfMatch: described.ETag,
    }),
  );

  return created.KeyValueStore.ARN;
}

describe("Reading a key value store from a CloudFront Function", () => {
  it("reads a key from source code running in the sandbox", async () => {
    // Given a store holding a redirect, and a Function whose source reaches it
    // through the import the runtime provides
    const simAws = new SimAws();
    const kvsArn = await storeWithRedirect(simAws);

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
            const target = await cf.kvs().get(event.request.uri);
            event.request.uri = target;
            return event.request;
          }
        `),
      }),
    );

    // When a request the store has a redirect for reaches the Function
    const cff = simAws.cloudFront().getCloudFrontFunctionByName("redirect-cff");
    assertNonNullable(cff);

    const result = await cff.handleViewerRequest(
      new Request("https://cdn.test/old"),
    );

    // Then the Function read the store and rewrote the request
    assertInstanceOf(result, Request);
    assertIdentical(new URL(result.url).pathname, "/new");
  });

  it("reads a key from a Function given as a function reference", async () => {
    // Given the same store, and a Function given as a bound handler rather
    // than as source, which has no sandbox of its own
    const simAws = new SimAws();
    const kvsArn = await storeWithRedirect(simAws);

    await simAws.cloudFront().createFunction(
      new CreateFunctionCommand({
        Name: "bound-redirect-cff",
        FunctionConfig: {
          Comment: "Redirects from a key value store",
          Runtime: "cloudfront-js-2.0",
          KeyValueStoreAssociations: {
            Quantity: 1,
            Items: [{ KeyValueStoreARN: kvsArn }],
          },
        },
        FunctionCode: makeCffFunctionCodeInput(
          async (event: CloudFrontFunctionType.ViewerRequestEvent) => {
            const request = event.request;
            request.uri = (await cf.kvs().get(request.uri)) as string;

            return request;
          },
        ),
      }),
    );

    // When a request reaches it
    const cff = simAws
      .cloudFront()
      .getCloudFrontFunctionByName("bound-redirect-cff");
    assertNonNullable(cff);

    const result = await cff.handleViewerRequest(
      new Request("https://cdn.test/old"),
    );

    // Then it read the same store, reached through asynchronous context
    assertInstanceOf(result, Request);
    assertIdentical(new URL(result.url).pathname, "/new");
  });

  it("reads a value written after the Function was created", async () => {
    // Given a Function created before the key it goes on to read
    const simAws = new SimAws();
    const kvsArn = await storeWithRedirect(simAws);

    await simAws.cloudFront().createFunction(
      new CreateFunctionCommand({
        Name: "late-key-cff",
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
            event.request.uri = await cf.kvs().get("/later");
            return event.request;
          }
        `),
      }),
    );

    // When the key is written afterwards
    const data = simAws.cloudFrontKeyValueStore();
    const described = await data.describeKeyValueStore(
      new DescribeKeyValueStoreCommand({ KvsARN: kvsArn }),
    );
    await data.putKey(
      new PutKeyCommand({
        KvsARN: kvsArn,
        Key: "/later",
        Value: "/written-later",
        IfMatch: described.ETag,
      }),
    );

    // Then the Function reads it, so the store is read live rather than
    // snapshotted when the Function was made
    const cff = simAws.cloudFront().getCloudFrontFunctionByName("late-key-cff");
    assertNonNullable(cff);

    const result = await cff.handleViewerRequest(
      new Request("https://cdn.test/anything"),
    );

    assertInstanceOf(result, Request);
    assertIdentical(new URL(result.url).pathname, "/written-later");
  });
});
