import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCloudFrontResponseHeader } from "./sim-cf-response-header.js";

describe("SimCloudFrontResponseHeader", () => {
  it("adds a header the Origin did not send", () => {
    // Given a policy header the Origin says nothing about.
    const headers = new Headers();

    // When it is applied without Override.
    new SimCloudFrontResponseHeader({
      name: "Vary",
      value: "Accept-Encoding",
      override: false,
    }).applyTo(headers);

    // Then it is added: Override only decides what happens to a header that is
    // already there.
    assertIdentical(headers.get("vary"), "Accept-Encoding");
  });

  it("replaces the Origin's value with Override set", () => {
    // Given an Origin response already carrying the header.
    const headers = new Headers({ "cache-control": "no-store" });

    // When the policy's header is applied with Override.
    new SimCloudFrontResponseHeader({
      name: "Cache-Control",
      value: "public, max-age=60",
      override: true,
    }).applyTo(headers);

    // Then the policy's value wins.
    assertIdentical(headers.get("cache-control"), "public, max-age=60");
  });

  it("keeps the Origin's value without Override", () => {
    // Given an Origin response already carrying the header.
    const headers = new Headers({ "cache-control": "no-store" });

    // When the policy's header is applied without Override.
    new SimCloudFrontResponseHeader({
      name: "Cache-Control",
      value: "public, max-age=60",
      override: false,
    }).applyTo(headers);

    // Then the Origin's value stays and the policy's is dropped.
    assertIdentical(headers.get("cache-control"), "no-store");
  });

  it("matches an Origin header whatever case it was sent in", () => {
    // Given an Origin response whose header name is cased differently.
    const headers = new Headers({ "Cache-Control": "no-store" });

    // When a policy header of the same name is applied without Override.
    new SimCloudFrontResponseHeader({
      name: "cache-control",
      value: "public, max-age=60",
      override: false,
    }).applyTo(headers);

    // Then it is recognised as the same header, as HTTP treats it.
    assertIdentical(headers.get("cache-control"), "no-store");
  });

  it("keeps the Origin's value when the policy does not say to override", () => {
    // Given an Origin response already carrying the header, and a policy header
    // built without an explicit Override.
    const headers = new Headers({ "cache-control": "no-store" });

    // When it is applied.
    new SimCloudFrontResponseHeader({
      name: "Cache-Control",
      value: "public, max-age=60",
    }).applyTo(headers);

    // Then not overriding is the default, as it is in CloudFront.
    assertIdentical(headers.get("cache-control"), "no-store");
  });
});
