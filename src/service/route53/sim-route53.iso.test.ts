import { describe, it } from "vitest";
import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { SimRoute53 } from "./sim-route53.js";

describe("SimRoute53", () => {
  it("resolves CloudFront built-in local hostname", () => {
    const route53 = new SimRoute53();

    const target = route53.resolveHttpHost(
      "abcd1234.cloudfront.net.sim-aws.localhost",
    );

    assertNonNullable(target);
    assertIdentical(target.service, "cloudFront");
    assertIdentical(target.resourceName, "abcd1234");
    assertUndefined(target.regionName);
  });

  it("resolves S3 website built-in local hostname", () => {
    const route53 = new SimRoute53();

    const target = route53.resolveHttpHost(
      "bucket-a.s3-website.eu-west-1.sim-aws.localhost",
    );

    assertNonNullable(target);
    assertIdentical(target.service, "s3");
    assertIdentical(target.resourceName, "bucket-a");
    assertIdentical(target.regionName, "eu-west-1");
  });

  it("returns undefined for non-local hostnames", () => {
    const route53 = new SimRoute53();

    assertUndefined(route53.resolveHttpHost("abcd1234.cloudfront.net"));
  });

  it("returns undefined for malformed local names", () => {
    const route53 = new SimRoute53();

    assertUndefined(
      route53.resolveHttpHost("..cloudfront.net.sim-aws.localhost"),
    );
  });

  it("resolves custom CNAME from local domain to CloudFront distro", () => {
    const route53 = new SimRoute53();
    route53.upsertRecord({
      name: "www.foo.com",
      type: "CNAME",
      values: ["d123.cloudfront.net"],
    });

    const target = route53.resolveHttpHost("www.foo.com.sim-aws.localhost");

    assertNonNullable(target);
    assertIdentical(target.service, "cloudFront");
    assertIdentical(target.resourceName, "d123");
  });

  it("follows CNAME chains", () => {
    const route53 = new SimRoute53();
    route53.upsertRecord({
      name: "www.foo.com",
      type: "CNAME",
      values: ["cdn.foo.com"],
    });
    route53.upsertRecord({
      name: "cdn.foo.com",
      type: "CNAME",
      values: ["d123.cloudfront.net"],
    });

    const target = route53.resolveHttpHost("www.foo.com.sim-aws.localhost");

    assertNonNullable(target);
    assertIdentical(target.service, "cloudFront");
    assertIdentical(target.resourceName, "d123");
  });

  it("stops CNAME loops", () => {
    const route53 = new SimRoute53();
    route53.upsertRecord({
      name: "www.foo.com",
      type: "CNAME",
      values: ["cdn.foo.com"],
    });
    route53.upsertRecord({
      name: "cdn.foo.com",
      type: "CNAME",
      values: ["www.foo.com"],
    });

    assertUndefined(route53.resolveHttpHost("www.foo.com.sim-aws.localhost"));
  });

  it("resolves TXT records for logical names", () => {
    const route53 = new SimRoute53();
    route53.upsertRecord({
      name: "_abc.foo.com",
      type: "TXT",
      values: ["validation-token"],
    });

    const record = route53.record("_abc.foo.com", "TXT");

    assertNonNullable(record);
    assertIdentical(record.values[0], "validation-token");
  });

  it("normalises trailing dots and casing", () => {
    const route53 = new SimRoute53();
    route53.upsertRecord({
      name: "WWW.FOO.COM.",
      type: "CNAME",
      values: ["D123.CLOUDFRONT.NET."],
    });

    const target = route53.resolveHttpHost("WWW.FOO.COM.SIM-AWS.LOCALHOST.");

    assertNonNullable(target);
    assertIdentical(target.service, "cloudFront");
    assertIdentical(target.resourceName, "d123");
  });
});
