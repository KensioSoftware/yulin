import { assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";
import { deriveSdkWireJsonShapes } from "../../../test/sdk/wire/sdk-wire-json-shapes.js";
import snapshot from "./sim-sdk-wire-json-shapes.json" with { type: "json" };

describe("the AWS JSON protocol input shapes snapshot", () => {
  it("matches the installed SDK client schemas", async () => {
    // Given the blob and timestamp members the installed SDK clients declare.
    // When they are derived afresh.
    const derived = await deriveSdkWireJsonShapes();

    // Then the committed snapshot the wire bridge decodes by is up to date.
    // When this fails after an SDK update, run `pnpm run sdk:wire-shapes`.
    assertObjectEquals(snapshot, derived);
  }, 60_000);
});
