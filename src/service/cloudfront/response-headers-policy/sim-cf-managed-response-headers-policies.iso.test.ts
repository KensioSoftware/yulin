import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simCfManagedResponseHeadersPolicyIds } from "./sim-cf-managed-response-headers-policies.js";
import { SimCloudFrontResponseHeadersPolicy } from "./sim-cf-response-headers-policy.js";
import { SimCloudFrontResponseHeadersPolicyRegistry } from "./sim-cf-response-headers-policy-registry.js";

describe("Managed CloudFront response headers policies", () => {
  /**
   * The response a Behavior on the given managed policy serves, for an Origin
   * response carrying the given headers.
   */
  function served(
    policyId: string,
    originHeaders: Record<string, string> = {},
    requestOrigin: string | null = null,
    requestMethod = "GET",
  ): Headers {
    const policy = new SimCloudFrontResponseHeadersPolicyRegistry().byId(
      policyId,
    );

    assertNonNullable(policy);

    return policy.apply(
      new Response("body", { headers: originHeaders }),
      requestOrigin,
      requestMethod,
    ).headers;
  }

  it("holds the five policies AWS manages, under the names it publishes", () => {
    // Given a registry nothing has created a policy in.
    const registry = new SimCloudFrontResponseHeadersPolicyRegistry();

    // When each managed ID is looked up, then the policy behind it carries
    // the name the CloudFront console shows.
    const names = Object.values(simCfManagedResponseHeadersPolicyIds).map(
      (id) => registry.byId(id)?.name,
    );

    assertIdentical(
      names.join(","),
      [
        "SimpleCORS",
        "CORS-With-Preflight",
        "SecurityHeadersPolicy",
        "CORS-and-SecurityHeadersPolicy",
        "CORS-with-preflight-and-SecurityHeadersPolicy",
      ].join(","),
    );
  });

  it("sets every security header SecurityHeadersPolicy documents", () => {
    // Given a Behavior on SecurityHeadersPolicy.
    // When an Origin response with none of them passes through it.
    const headers = served(
      simCfManagedResponseHeadersPolicyIds.securityHeaders,
    );

    // Then all five arrive with the values AWS documents.
    assertIdentical(
      headers.get("referrer-policy"),
      "strict-origin-when-cross-origin",
    );
    assertIdentical(
      headers.get("strict-transport-security"),
      "max-age=31536000",
    );
    assertIdentical(headers.get("x-content-type-options"), "nosniff");
    assertIdentical(headers.get("x-frame-options"), "SAMEORIGIN");
    assertIdentical(headers.get("x-xss-protection"), "1; mode=block");
  });

  it("overrides only X-Content-Type-Options on a site that sends its own", () => {
    // Given an Origin sending two of the security headers itself.
    // When the response passes through SecurityHeadersPolicy.
    const headers = served(
      simCfManagedResponseHeadersPolicyIds.securityHeaders,
      {
        "X-Content-Type-Options": "sniff-away",
        "X-Frame-Options": "DENY",
      },
    );

    // Then nosniff replaces the Origin's value and the frame options survive,
    // which is the one Override AWS sets on this policy.
    assertIdentical(headers.get("x-content-type-options"), "nosniff");
    assertIdentical(headers.get("x-frame-options"), "DENY");
  });

  it("answers a simple CORS request with the wildcard Origin alone", () => {
    // Given a Behavior on SimpleCORS.
    // When a request naming an Origin passes through it.
    const headers = served(
      simCfManagedResponseHeadersPolicyIds.simpleCors,
      {},
      "https://app.example.com",
    );

    // Then the wildcard is the whole of it. SimpleCORS names no method and no
    // header, and CloudFront sends neither list.
    assertIdentical(headers.get("access-control-allow-origin"), "*");
    assertIdentical(headers.get("access-control-allow-methods"), null);
    assertIdentical(headers.get("access-control-allow-headers"), null);
    assertIdentical(headers.get("access-control-expose-headers"), null);
  });

  it("names every method CORS-With-Preflight allows, on a preflight", () => {
    // Given a Behavior on CORS-With-Preflight.
    // When a preflight naming an Origin passes through it.
    const headers = served(
      simCfManagedResponseHeadersPolicyIds.corsWithPreflight,
      {},
      "https://app.example.com",
      "OPTIONS",
    );

    // Then the method list and the wildcard expose list come with the Origin.
    assertIdentical(headers.get("access-control-allow-origin"), "*");
    assertIdentical(
      headers.get("access-control-allow-methods"),
      "DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT",
    );
    assertIdentical(headers.get("access-control-expose-headers"), "*");
  });

  it("holds the method list back from a simple CORS-With-Preflight request", () => {
    // Given a Behavior on CORS-With-Preflight.
    // When a plain GET naming an Origin passes through it.
    const headers = served(
      simCfManagedResponseHeadersPolicyIds.corsWithPreflight,
      {},
      "https://app.example.com",
    );

    // Then the Origin and the expose list come back without the method list,
    // which is what AWS documents for a simple CORS request.
    assertIdentical(headers.get("access-control-allow-origin"), "*");
    assertIdentical(headers.get("access-control-expose-headers"), "*");
    assertIdentical(headers.get("access-control-allow-methods"), null);
  });

  it("combines both sections in CORS-and-SecurityHeadersPolicy", () => {
    // Given a Behavior on the combined policy.
    // When a request naming an Origin passes through it.
    const headers = served(
      simCfManagedResponseHeadersPolicyIds.corsAndSecurityHeaders,
      {},
      "https://app.example.com",
    );

    // Then the response carries the CORS header and the security headers.
    assertIdentical(headers.get("access-control-allow-origin"), "*");
    assertIdentical(headers.get("x-content-type-options"), "nosniff");
  });

  it("lets a template create a policy under a managed policy's name", () => {
    // Given a registry holding the managed policies.
    const registry = new SimCloudFrontResponseHeadersPolicyRegistry();

    // When a template creates one called SecurityHeadersPolicy, which is a
    // name CloudFront keeps in its own namespace rather than the account's.
    const created = new SimCloudFrontResponseHeadersPolicy({
      name: "SecurityHeadersPolicy",
    });

    registry.add(created);

    // Then both are there, each under its own ID.
    assertIdentical(registry.byId(created.id)?.name, "SecurityHeadersPolicy");
    assertIdentical(
      registry.byId(simCfManagedResponseHeadersPolicyIds.securityHeaders)?.name,
      "SecurityHeadersPolicy",
    );
  });

  it("keeps the managed policies when a stack takes its own away", () => {
    // Given a registry a template has created a policy in.
    const registry = new SimCloudFrontResponseHeadersPolicyRegistry();
    const created = new SimCloudFrontResponseHeadersPolicy({
      name: "CacheHeaders",
    });

    registry.add(created);

    // When deleting the stack forgets it.
    registry.remove(created.id);

    // Then the managed policies are where they were, since no stack owns them.
    assertUndefined(registry.byId(created.id));
    assertNonNullable(
      registry.byId(simCfManagedResponseHeadersPolicyIds.simpleCors),
    );
  });
});
