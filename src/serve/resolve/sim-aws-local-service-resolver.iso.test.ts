import { describe, it } from "vitest";
import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { SimAwsLocalServiceResolver } from "./sim-aws-local-service-resolver.js";

describe("SimAwsLocalServiceResolver", () => {
  it("resolves S3 website localhost host", () => {
    const resolver = new SimAwsLocalServiceResolver();

    const target = resolver.resolveHost(
      "bucket-a.s3-website.eu-west-1.sim-aws.localhost",
    );

    assertNonNullable(target);
    assertIdentical(target.service, "s3");
    assertIdentical(target.resourceName, "bucket-a");
    assertIdentical(target.regionName, "eu-west-1");
  });

  it("resolves dotted S3 website resource name", () => {
    const resolver = new SimAwsLocalServiceResolver();

    const target = resolver.resolveHost(
      "foo.bar.s3-website.eu-west-1.sim-aws.localhost",
    );

    assertNonNullable(target);
    assertIdentical(target.service, "s3");
    assertIdentical(target.resourceName, "foo.bar");
    assertIdentical(target.regionName, "eu-west-1");
  });

  it("returns undefined for non-localhost host", () => {
    const resolver = new SimAwsLocalServiceResolver();
    assertUndefined(
      resolver.resolveHost("bucket-a.s3-website.eu-west-1.sim-aws.example.com"),
    );
  });

  it("returns undefined for host without resource name", () => {
    const resolver = new SimAwsLocalServiceResolver();
    assertUndefined(
      resolver.resolveHost("s3-website.eu-west-1.sim-aws.localhost"),
    );
  });

  it("returns undefined for host without region name", () => {
    const resolver = new SimAwsLocalServiceResolver();
    assertUndefined(
      resolver.resolveHost("bucket-a.s3-website.sim-aws.localhost"),
    );
  });

  it("returns undefined for unknown service label", () => {
    const resolver = new SimAwsLocalServiceResolver();
    assertUndefined(
      resolver.resolveHost("bucket-a.s3.eu-west-1.sim-aws.localhost"),
    );
  });

  it("returns undefined for empty resource name", () => {
    const resolver = new SimAwsLocalServiceResolver();
    assertUndefined(
      resolver.resolveHost(".s3-website.eu-west-1.sim-aws.localhost"),
    );
  });

  it("returns undefined for empty region name", () => {
    const resolver = new SimAwsLocalServiceResolver();
    assertUndefined(
      resolver.resolveHost("bucket-a.s3-website..sim-aws.localhost"),
    );
  });

  it("resolves CloudFront localhost host", () => {
    const resolver = new SimAwsLocalServiceResolver();

    const target = resolver.resolveHost(
      "abcd1234.cloudfront.net.sim-aws.localhost",
    );

    assertNonNullable(target);
    assertIdentical(target.service, "cloudFront");
    assertIdentical(target.resourceName, "abcd1234");
    assertUndefined(target.regionName);
  });

  it("returns undefined for CloudFront host without localhost suffix", () => {
    const resolver = new SimAwsLocalServiceResolver();
    assertUndefined(
      resolver.resolveHost("abcd1234.cloudfront.net.sim-aws.example.com"),
    );
  });

  it("returns undefined for CloudFront host with insufficient labels", () => {
    const resolver = new SimAwsLocalServiceResolver();
    assertUndefined(resolver.resolveHost("cloudfront.net.sim-aws.localhost"));
  });

  it("returns undefined for CloudFront host with empty distribution ID", () => {
    const resolver = new SimAwsLocalServiceResolver();
    assertUndefined(resolver.resolveHost("..cloudfront.net.sim-aws.localhost"));
  });
});
