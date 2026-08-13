import {
  assertArrayLength,
  assertIdentical,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCloudFrontKeyValueStore } from "./sim-cf-key-value-store.js";
import { SimCloudFrontKeyValueStoreRegistry } from "./sim-cf-key-value-store-registry.js";

function storeNamed(name: string): SimCloudFrontKeyValueStore {
  return new SimCloudFrontKeyValueStore({ name });
}

describe("Sim CloudFront key value store registry", () => {
  it("finds a stored key value store by ID, name and ARN", () => {
    // Given a registry holding one store
    const registry = new SimCloudFrontKeyValueStoreRegistry();
    const store = storeNamed("redirects");
    registry.add(store);

    // When it is looked for each of the three ways
    // Then each finds it, because each API reaches for a different one
    assertIdentical(registry.byId(store.id), store);
    assertIdentical(registry.byName("redirects"), store);
    assertIdentical(registry.byArn(store.arn), store);
  });

  it("refuses a name another key value store already holds", () => {
    // Given a registry that already holds a store called redirects
    const registry = new SimCloudFrontKeyValueStoreRegistry();
    registry.add(storeNamed("redirects"));

    // When a second store claims the same name
    const error = assertThrowsError(() => {
      registry.add(storeNamed("redirects"));
    });

    // Then it is refused, as CloudFront refuses one
    assertIdentical(error.name, "EntityAlreadyExists");
  });

  it("allows a name that was freed by a delete", () => {
    // Given a registry whose only store has been removed
    const registry = new SimCloudFrontKeyValueStoreRegistry();
    const first = storeNamed("redirects");
    registry.add(first);
    registry.remove(first.id);

    // When another store claims that name
    const second = storeNamed("redirects");
    registry.add(second);

    // Then it is stored, and the first one is gone
    assertIdentical(registry.byName("redirects"), second);
    assertUndefined(registry.byId(first.id));
  });

  it("refuses a lookup for a key value store it does not hold", () => {
    // Given an empty registry
    const registry = new SimCloudFrontKeyValueStoreRegistry();

    // When a store is required by each of the three ways
    // Then each is refused, quoting back what it was given. The ARN lookup is
    // the data API's way in, so it answers with that API's own error rather
    // than CloudFront's: the two clients have separate error sets.
    for (const required of [
      {
        find: (): unknown => registry.requireById("no-such-id"),
        name: "EntityNotFound",
      },
      {
        find: (): unknown => registry.requireByName("no-such-name"),
        name: "EntityNotFound",
      },
      {
        find: (): unknown => registry.requireByArn("no-such-arn"),
        name: "ResourceNotFoundException",
      },
    ]) {
      const error = assertThrowsError(required.find);
      assertIdentical(error.name, required.name);
    }
  });

  it("hands back every key value store it holds", () => {
    // Given a registry holding two stores
    const registry = new SimCloudFrontKeyValueStoreRegistry();
    registry.add(storeNamed("redirects"));
    registry.add(storeNamed("flags"));

    // When they are all read
    // Then both are there
    assertArrayLength(registry.all(), 2);
  });

  it("finds nothing in an empty registry", () => {
    // Given an empty registry
    const registry = new SimCloudFrontKeyValueStoreRegistry();

    // When a store is looked for
    // Then nothing is found, rather than something being thrown
    assertUndefined(registry.byId("nope"));
    assertUndefined(registry.byName("nope"));
    assertUndefined(registry.byArn("nope"));
    assertArrayLength(registry.all(), 0);
  });
});
