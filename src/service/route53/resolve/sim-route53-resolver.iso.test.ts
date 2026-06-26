import { assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimRoute53Resolver } from "./sim-route53-resolver.js";

describe("SimRoute53Resolver", () => {
  it("returns undefined when the hostname is not a local Route53 name", () => {
    // Given a Route53 resolver.
    const resolver = new SimRoute53Resolver({
      hostedZones: new Map(),
    });

    // When a non-local hostname is resolved.
    const target = resolver.resolveHttpHost("example.com");

    // Then no target is resolved.
    assertUndefined(target);
  });
});
