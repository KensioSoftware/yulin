import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCloudFrontOriginAccessControlRegistry } from "./sim-cf-origin-access-control-registry.js";
import { SimCloudFrontOriginAccessControl } from "./sim-cf-origin-access-control.js";

describe("SimCloudFrontOriginAccessControlRegistry", () => {
  function anOriginAccessControl(
    name: string,
  ): SimCloudFrontOriginAccessControl {
    return new SimCloudFrontOriginAccessControl({
      name,
      signingBehavior: "always",
    });
  }

  it("finds a stored origin access control by ID and by name", () => {
    // Given a stored origin access control.
    const registry = new SimCloudFrontOriginAccessControlRegistry();
    const originAccessControl = anOriginAccessControl("site-oac");
    registry.add(originAccessControl);

    // Then it is found by the ID an Origin names, and by name.
    assertIdentical(registry.byId(originAccessControl.id), originAccessControl);
    assertIdentical(registry.byName("site-oac"), originAccessControl);
  });

  it("finds nothing for an ID it does not hold", () => {
    // Given an empty registry.
    const registry = new SimCloudFrontOriginAccessControlRegistry();

    // Then an ID nothing created finds nothing, which is what lets a
    // Distribution refuse it.
    assertUndefined(registry.byId("E1EXAMPLE12345"));
    assertUndefined(registry.byName("site-oac"));
  });

  it("refuses a name another origin access control already holds", () => {
    // Given a stored origin access control.
    const registry = new SimCloudFrontOriginAccessControlRegistry();
    registry.add(anOriginAccessControl("site-oac"));

    // When a second one claims the same name.
    const error = assertThrowsError(() => {
      registry.add(anOriginAccessControl("site-oac"));
    });

    // Then it is refused as CloudFront refuses one, naming the duplicate.
    assertIdentical(error.name, "OriginAccessControlAlreadyExists");
    assertStringIncludes(error.message, "site-oac");
  });

  it("forgets an origin access control", () => {
    // Given a stored origin access control.
    const registry = new SimCloudFrontOriginAccessControlRegistry();
    const originAccessControl = anOriginAccessControl("site-oac");
    registry.add(originAccessControl);

    // When it is removed, as a Stack teardown removes it.
    registry.remove(originAccessControl.id);

    // Then it is no longer found, and its name is free again.
    assertUndefined(registry.byId(originAccessControl.id));
    registry.add(anOriginAccessControl("site-oac"));
  });
});
