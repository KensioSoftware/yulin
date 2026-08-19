import { describe, expect, it } from "vitest";

import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";
import { simRestApiPatchOf } from "./sim-rest-api-patch.js";

describe("Reading REST API patch operations", () => {
  it("reads a replacement of each path it simulates", () => {
    // Given operations replacing both replaceable paths
    const operations = [
      { op: "replace", path: "/name", value: "orders-v2" },
      { op: "replace", path: "/description", value: "The second one" },
    ];

    // When they are read
    const patch = simRestApiPatchOf(operations);

    // Then both changes come out
    expect(patch).toStrictEqual({
      name: "orders-v2",
      description: "The second one",
    });
  });

  it("reads a cleared description as an empty one", () => {
    // Given an operation replacing the description with nothing, which is how
    // a description is removed
    const operations = [{ op: "replace", path: "/description" }];

    // When it is read
    const patch = simRestApiPatchOf(operations);

    // Then the description is emptied rather than left alone
    expect(patch).toStrictEqual({ description: "" });
  });

  it("refuses an operation other than a replacement", () => {
    // Given an operation adding rather than replacing
    const operations = [{ op: "add", path: "/name", value: "orders-v2" }];

    // When it is read
    const read = (): unknown => simRestApiPatchOf(operations);

    // Then it is refused, since only replacement is simulated
    expect(read).toThrow(SimApiGatewayBadRequest);
    expect(read).toThrow("op 'add' is not simulated");
  });

  it("requires a value for the name it replaces", () => {
    // Given a replacement of the name carrying no value
    const operations = [{ op: "replace", path: "/name" }];

    // When it is read
    const read = (): unknown => simRestApiPatchOf(operations);

    // Then it is refused, because an API has to be named
    expect(read).toThrow(SimApiGatewayBadRequest);
    expect(read).toThrow("replacing /name requires a value");
  });
});
