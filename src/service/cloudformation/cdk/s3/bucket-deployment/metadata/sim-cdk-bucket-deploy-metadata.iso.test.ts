import {
  assertArrayLength,
  assertFalse,
  assertObjectEquals,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCfnResource } from "../../../../resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../../template/value/sim-cfn-template-value.js";
import { SimS3Bucket } from "../../../../../s3/bucket/sim-s3-bucket.js";
import { SimCdkBucketDeployProperties } from "../property/sim-cdk-bucket-deploy-properties.js";
import {
  declareSimCdkBucketDeployMetadata,
  SimCdkBucketDeployMetadata,
} from "./sim-cdk-bucket-deploy-metadata.js";

describe("SimCdkBucketDeployMetadata", () => {
  const resource = new SimCfnResource({
    logicalId: "DeploySite",
    stackName: "FooStack",
  });

  function declaration(
    values: SimCfnTemplateValueRecord,
    publishedKeys: readonly string[] = [],
  ): SimCdkBucketDeployMetadata {
    return new SimCdkBucketDeployMetadata({
      properties: new SimCdkBucketDeployProperties(resource, {
        DestinationBucketName: "site-bucket",
        SourceObjectKeys: ["abc123.zip"],
        ...values,
      }),
      publishedKeys: new Set(publishedKeys),
    });
  }

  it("declares the system metadata the deployment sets", () => {
    // Given a deployment that published a compressed mirror.
    const declared = declaration(
      {
        DestinationBucketKeyPrefix: "br",
        SystemMetadata: {
          "content-encoding": "br",
          "cache-control": "public, max-age=31536000, immutable",
        },
      },
      ["br/js/app.js"],
    );

    // Then it says what it published, under the fields a declaration is written
    // in rather than the headers the sync sets.
    assertObjectEquals(declared.metadata, {
      ContentEncoding: "br",
      CacheControl: "public, max-age=31536000, immutable",
    });

    // And it is about the Object it put there.
    assertTrue(declared.describes("br/js/app.js"));
    assertFalse(declared.describes("js/app.js"));
  });

  it("says what it would publish under a key it has not seen", () => {
    // Given the deployment that publishes everything but the data directory,
    // which is how a site splits its headers across two deployments.
    const declared = declaration(
      {
        Exclude: ["data/*"],
        SystemMetadata: { "cache-control": "public, max-age=0" },
      },
      ["index.html"],
    );

    // Then a page a later build added is one this deployment would publish, so
    // a mount serving it can answer as the deployment would have.
    assertTrue(declared.wouldDescribe("about.html"));

    // And a file its filters leave to the other deployment is not, even though
    // both deploy into the same Bucket at the same prefix.
    assertFalse(declared.wouldDescribe("data/standard.keys"));
  });

  it("would publish only under its own destination prefix", () => {
    // Given a deployment into a prefix of its own.
    const declared = declaration({ DestinationBucketKeyPrefix: "br" }, []);

    // Then its rule is about the keys under that prefix, and the filters it
    // does not have leave everything under it in.
    assertTrue(declared.wouldDescribe("br/js/app.js"));
    assertFalse(declared.wouldDescribe("js/app.js"));
  });

  it("declares nothing for a deployment that sets no headers", () => {
    // Given a plain deployment, which is most of them.
    const declared = declaration({}, ["index.html"]);

    // Then it describes its Objects and has nothing to say about them, so a
    // mount over the Bucket is left with what the file extensions give it.
    assertTrue(declared.describes("index.html"));
    assertObjectEquals(declared.metadata, {});
  });

  it("replaces what the same deployment said last time", () => {
    // Given a destination Bucket, and a deployment that has described it.
    const bucket = new SimS3Bucket({ bucketName: "site-bucket" });
    const declare = (cacheControl: string): void => {
      declareSimCdkBucketDeployMetadata({
        bucket,
        resource,
        properties: new SimCdkBucketDeployProperties(resource, {
          DestinationBucketName: "site-bucket",
          SourceObjectKeys: ["abc123.zip"],
          SystemMetadata: { "cache-control": cacheControl },
        }),
        publishedKeys: new Set(["index.html"]),
      });
    };

    declare("public, max-age=0");

    // When the Stack is deployed again with a different directive, as a
    // watching dev process redeploying a changed template does.
    declare("no-store");

    // Then the Bucket holds one declaration from this deployment, saying what
    // it says now.
    const declarations = bucket.getDeclaredSystemMetadata().declarations();

    assertArrayLength(declarations, 1);
    assertObjectEquals(declarations[0].metadata, { CacheControl: "no-store" });
  });

  it("keeps a Resource deployed outside a Stack apart from one in it", () => {
    // Given a Bucket described by the same logical ID in two places, one of
    // them a template deployed on its own with no Stack name.
    const bucket = new SimS3Bucket({ bucketName: "site-bucket" });
    const properties = new SimCdkBucketDeployProperties(resource, {
      DestinationBucketName: "site-bucket",
      SourceObjectKeys: ["abc123.zip"],
    });

    declareSimCdkBucketDeployMetadata({
      bucket,
      resource,
      properties,
      publishedKeys: new Set(["index.html"]),
    });
    declareSimCdkBucketDeployMetadata({
      bucket,
      resource: new SimCfnResource({ logicalId: "DeploySite" }),
      properties,
      publishedKeys: new Set(["index.html"]),
    });

    // Then both are kept, because they are two deployments rather than one
    // saying the same thing twice.
    assertArrayLength(bucket.getDeclaredSystemMetadata().declarations(), 2);
  });
});
