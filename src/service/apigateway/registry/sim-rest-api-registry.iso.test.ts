import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimRestApiRegistry } from "./sim-rest-api-registry.js";

const accountId = "111111111111" as SimAwsAccountId;

describe("The simulated REST API id registry", () => {
  it("gets from an allocated id to the Account that owns it", () => {
    // Given a registry
    const registry = new SimRestApiRegistry();

    // When an id is allocated to an Account
    const apiId = registry.allocateApiId(accountId);

    // Then the id resolves back to it, which is the hop a served request needs
    // from a hostname carrying no Account
    assertIdentical(registry.accountIdForApi(apiId), accountId);
  });

  it("resolves nothing for an id it never allocated", () => {
    // Given a registry that has allocated one id
    const registry = new SimRestApiRegistry();
    registry.allocateApiId(accountId);

    // When another id is looked up
    const found = registry.accountIdForApi("nosuchapi1");

    // Then it resolves to no Account
    assertUndefined(found);
  });

  it("stops resolving an id once its API is deleted", () => {
    // Given an allocated id
    const registry = new SimRestApiRegistry();
    const apiId = registry.allocateApiId(accountId);

    // When the API is deregistered
    registry.deregisterApi(apiId);

    // Then its endpoint reaches nothing
    assertUndefined(registry.accountIdForApi(apiId));
  });

  it("allocates ids that are unique across the simulation", () => {
    // Given a registry
    const registry = new SimRestApiRegistry();

    // When many ids are allocated across two Accounts
    const ids = Array.from({ length: 50 }, (_, index) =>
      registry.allocateApiId(
        (index % 2 === 0 ? accountId : "222222222222") as SimAwsAccountId,
      ),
    );

    // Then no two APIs share one, since an id is the whole of an endpoint's
    // leading DNS label
    expect(new Set(ids).size).toStrictEqual(ids.length);
  });
});
