import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simCfCorsOriginPatternIsValid,
  simCfCorsOriginPatternMatches,
} from "./sim-cf-cors-origin-pattern.js";

describe("simCfCorsOriginPatternIsValid", () => {
  it("accepts an exact Origin and the bare wildcard", () => {
    assertTrue(simCfCorsOriginPatternIsValid("https://example.org"));
    assertTrue(simCfCorsOriginPatternIsValid("*"));
  });

  it("accepts the wildcard as the leftmost subdomain", () => {
    assertTrue(simCfCorsOriginPatternIsValid("*.example.org"));
    assertTrue(simCfCorsOriginPatternIsValid("https://*.example.org"));
  });

  it("refuses the wildcard anywhere CloudFront does not allow one", () => {
    // The four positions CloudFront documents as invalid.
    assertFalse(simCfCorsOriginPatternIsValid("example.*"));
    assertFalse(simCfCorsOriginPatternIsValid("test.*.example.org"));
    assertFalse(simCfCorsOriginPatternIsValid("*test.example.org"));
    assertFalse(simCfCorsOriginPatternIsValid("exa*mple.org"));
  });
});

describe("simCfCorsOriginPatternMatches", () => {
  it("matches an exact Origin", () => {
    assertTrue(
      simCfCorsOriginPatternMatches(
        "https://example.org",
        "https://example.org",
      ),
    );
    assertFalse(
      simCfCorsOriginPatternMatches("https://example.org", "https://other.org"),
    );
  });

  it("matches one leftmost subdomain", () => {
    // A wildcard stands for exactly one label, as a wildcard certificate does.
    assertTrue(
      simCfCorsOriginPatternMatches(
        "*.example.org",
        "https://site.example.org",
      ),
    );
    assertFalse(
      simCfCorsOriginPatternMatches(
        "*.example.org",
        "https://deep.site.example.org",
      ),
    );
  });

  it("does not let a wildcard match the bare domain", () => {
    assertFalse(
      simCfCorsOriginPatternMatches("*.example.org", "https://example.org"),
    );
  });

  it("matches any scheme when the pattern names none", () => {
    assertTrue(
      simCfCorsOriginPatternMatches("*.example.org", "http://site.example.org"),
    );
  });

  it("requires the scheme to match when the pattern names one", () => {
    assertTrue(
      simCfCorsOriginPatternMatches(
        "https://*.example.org",
        "https://site.example.org",
      ),
    );
    assertFalse(
      simCfCorsOriginPatternMatches(
        "https://*.example.org",
        "http://site.example.org",
      ),
    );
  });

  it("does not match a different domain that ends the same way", () => {
    assertFalse(
      simCfCorsOriginPatternMatches(
        "*.example.org",
        "https://site.notexample.org",
      ),
    );
  });
});
