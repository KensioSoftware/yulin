import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simCfInvalidationCovers } from "./sim-cf-invalidation-path.js";

describe("A sim CloudFront invalidation path", () => {
  it("covers the one object it names", () => {
    // Given a path naming one object.
    // When it is matched against that object and against another.
    // Then it covers the one it names alone.
    assertTrue(simCfInvalidationCovers("/index.html", "/index.html"));
    assertFalse(simCfInvalidationCovers("/index.html", "/about.html"));
  });

  it("covers everything below a trailing wildcard", () => {
    // Given a path ending in a wildcard.
    // When it is matched against objects inside and outside it.
    // Then it covers what is below it and leaves the rest alone.
    assertTrue(simCfInvalidationCovers("/images/*", "/images/logo.png"));
    assertTrue(simCfInvalidationCovers("/images/*", "/images/icons/up.svg"));
    assertFalse(simCfInvalidationCovers("/images/*", "/index.html"));
  });

  it("covers the paths a partial name starts", () => {
    // Given a wildcard part way through a name.
    // When it is matched against two objects starting with it.
    // Then both are covered, as CloudFront covers them.
    assertTrue(simCfInvalidationCovers("/index*", "/index.html"));
    assertTrue(simCfInvalidationCovers("/index*", "/index.json"));
    assertFalse(simCfInvalidationCovers("/index*", "/about.html"));
  });

  it("covers everything under the whole-Distribution wildcard", () => {
    // Given the path that clears a Distribution.
    // When it is matched against anything at all.
    // Then it covers it.
    assertTrue(simCfInvalidationCovers("/*", "/"));
    assertTrue(simCfInvalidationCovers("/*", "/deep/page.html"));
  });

  it("reads a path missing its leading slash as though it had one", () => {
    // Given the bare wildcard a caller types without a slash.
    // When it is matched against an object.
    // Then it is read as the path CloudFront takes, with the slash.
    assertTrue(simCfInvalidationCovers("*", "/index.html"));
    assertTrue(simCfInvalidationCovers("index.html", "/index.html"));
  });
});
