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
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { makeCffFunctionCodeInput } from "../function-code-input/cff-function-code-input.js";
import type { CloudFrontFunction as CloudFrontFunctionType } from "../../typings/cloudfront-functions.namespace.js";

import "../../globals.js";

/**
 * A store holding one key, and a Function associated with it that reads it.
 *
 * The Function is a bound handler rather than source, because that is the kind
 * with no sandbox of its own: two of them in one process are what asynchronous
 * context has to keep apart.
 */
async function functionReading(
  simAws: SimAws,
  name: string,
  value: string,
): Promise<void> {
  const created = await simAws
    .cloudFront()
    .keyValueStores()
    .createKeyValueStore(new CreateKeyValueStoreCommand({ Name: name }));

  const data = simAws.cloudFrontKeyValueStore();
  const described = await data.describeKeyValueStore(
    new DescribeKeyValueStoreCommand({ KvsARN: created.KeyValueStore.ARN }),
  );
  await data.putKey(
    new PutKeyCommand({
      KvsARN: created.KeyValueStore.ARN,
      Key: "/target",
      Value: value,
      IfMatch: described.ETag,
    }),
  );

  await simAws.cloudFront().createFunction(
    new CreateFunctionCommand({
      Name: name,
      FunctionConfig: {
        Comment: `Reads the ${name} store`,
        Runtime: "cloudfront-js-2.0",
        KeyValueStoreAssociations: {
          Quantity: 1,
          Items: [{ KeyValueStoreARN: created.KeyValueStore.ARN }],
        },
      },
      FunctionCode: makeCffFunctionCodeInput(
        async (event: CloudFrontFunctionType.ViewerRequestEvent) => {
          const request = event.request;

          // Yield before the read, so the two invocations really do overlap
          // rather than each running to completion in turn.
          await Promise.resolve();
          request.uri = (await cf.kvs().get("/target")) as string;

          return request;
        },
      ),
    }),
  );
}

describe("Two CloudFront Functions reading different key value stores", () => {
  it("each read their own store when invoked concurrently", async () => {
    // Given two Functions, each associated with a store of its own
    const simAws = new SimAws();
    await functionReading(simAws, "first", "/from-first");
    await functionReading(simAws, "second", "/from-second");

    const first = simAws.cloudFront().getCloudFrontFunctionByName("first");
    const second = simAws.cloudFront().getCloudFrontFunctionByName("second");
    assertNonNullable(first);
    assertNonNullable(second);

    // When both run at once, overlapping across their await points
    const [firstResult, secondResult] = await Promise.all([
      first.handleViewerRequest(new Request("https://cdn.test/a")),
      second.handleViewerRequest(new Request("https://cdn.test/b")),
    ]);

    // Then neither read the other's store: the context follows each invocation
    // rather than being one value shared by the process
    assertInstanceOf(firstResult, Request);
    assertInstanceOf(secondResult, Request);
    assertIdentical(new URL(firstResult.url).pathname, "/from-first");
    assertIdentical(new URL(secondResult.url).pathname, "/from-second");
  });

  it("leaves cf undefined outside an invocation", () => {
    // Given no Function running
    // When cf is read from ordinary test code
    // Then it is undefined, so the global is inert outside an invocation and
    // a handler called directly cannot read another Function's store
    // Read off globalThis rather than as the bare `cf`, whose declared type
    // says it is always there: it is, inside a Function, which is the only
    // place a user writes it.
    assertUndefined((globalThis as { cf?: unknown }).cf);
  });
});
