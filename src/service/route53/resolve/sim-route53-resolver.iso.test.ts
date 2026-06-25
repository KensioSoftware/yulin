import { describe, it } from "vitest";
import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { SimRoute53Zone } from "../zone/sim-route53-zone.js";
import { SimRoute53Resolver } from "./sim-route53-resolver.js";

describe("SimRoute53Resolver", () => {
  it("resolves S3 website built-in local hostnames", () => {
    // Given a resolver backed by an empty Route53 zone.
    const resolver = new SimRoute53Resolver({ zone: new SimRoute53Zone() });

    // When resolving a local S3 website hostname.
    const target = resolver.resolveHttpHost(
      "bucket-a.s3-website.eu-west-1.sim-aws.localhost",
    );

    // Then the hostname maps to the matching simulated S3 website target.
    assertNonNullable(target);
    assertIdentical(target.service, "s3");
    assertIdentical(target.resourceName, "bucket-a");
    assertIdentical(target.regionName, "eu-west-1");
  });

  it("resolves CloudFront built-in local hostnames", () => {
    // Given a resolver backed by an empty Route53 zone.
    const resolver = new SimRoute53Resolver({ zone: new SimRoute53Zone() });

    // When resolving a local CloudFront hostname.
    const target = resolver.resolveHttpHost(
      "distro123.cloudfront.net.sim-aws.localhost",
    );

    // Then the hostname maps to the matching simulated CloudFront target.
    assertNonNullable(target);
    assertIdentical(target.service, "cloudFront");
    assertIdentical(target.resourceName, "distro123");
    assertUndefined(target.regionName);
  });

  it("follows CNAME chains to built-in local hostnames", () => {
    // Given a resolver with chained CNAME records for a custom domain.
    const zone = new SimRoute53Zone();
    zone.upsertRecord({
      name: "www.foo.com",
      type: "CNAME",
      values: ["cdn.foo.com"],
    });
    zone.upsertRecord({
      name: "cdn.foo.com",
      type: "CNAME",
      values: ["distro123.cloudfront.net"],
    });
    const resolver = new SimRoute53Resolver({ zone });

    // When resolving the local hostname for the custom domain.
    const target = resolver.resolveHttpHost("www.foo.com.sim-aws.localhost");

    // Then the resolver follows the chain to the final service target.
    assertNonNullable(target);
    assertIdentical(target.service, "cloudFront");
    assertIdentical(target.resourceName, "distro123");
  });

  it("returns undefined for non-local hostnames", () => {
    // Given a resolver backed by an empty Route53 zone.
    const resolver = new SimRoute53Resolver({ zone: new SimRoute53Zone() });

    // When resolving a hostname outside the simulated local domain.
    const target = resolver.resolveHttpHost("distro123.cloudfront.net");

    // Then no simulated service target is returned.
    assertUndefined(target);
  });

  it("returns undefined for missing CNAME targets", () => {
    // Given a resolver with no records for a custom local hostname.
    const resolver = new SimRoute53Resolver({ zone: new SimRoute53Zone() });

    // When resolving that custom local hostname.
    const target = resolver.resolveHttpHost("www.foo.com.sim-aws.localhost");

    // Then no simulated service target is returned.
    assertUndefined(target);
  });

  it("returns undefined for incomplete built-in local hostnames", () => {
    // Given a resolver backed by an empty Route53 zone.
    const resolver = new SimRoute53Resolver({ zone: new SimRoute53Zone() });

    // When resolving a local hostname without enough service labels.
    const target = resolver.resolveHttpHost("cloudfront.net.sim-aws.localhost");

    // Then no simulated service target is returned.
    assertUndefined(target);
  });

  it("stops CNAME loops", () => {
    // Given a resolver with CNAME records that point back to each other.
    const zone = new SimRoute53Zone();
    zone.upsertRecord({
      name: "www.foo.com",
      type: "CNAME",
      values: ["cdn.foo.com"],
    });
    zone.upsertRecord({
      name: "cdn.foo.com",
      type: "CNAME",
      values: ["www.foo.com"],
    });
    const resolver = new SimRoute53Resolver({ zone });

    // When resolving a local hostname that enters the loop.
    const target = resolver.resolveHttpHost("www.foo.com.sim-aws.localhost");

    // Then the resolver stops without returning a service target.
    assertUndefined(target);
  });
});
