import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCfnResource } from "../../../../resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../../template/value/sim-cfn-template-value.js";
import { SimCdkBucketDeployProperties } from "./sim-cdk-bucket-deploy-properties.js";

describe("SimCdkBucketDeployProperties", () => {
  const resource = new SimCfnResource({ logicalId: "DeploySite" });

  function properties(
    values: SimCfnTemplateValueRecord,
  ): SimCdkBucketDeployProperties {
    return new SimCdkBucketDeployProperties(resource, {
      DestinationBucketName: "site-bucket",
      SourceObjectKeys: ["abc123.zip"],
      ...values,
    });
  }

  it("reads the destination and source a deployment names", () => {
    // Given the properties CDK synthesizes for a plain BucketDeployment.
    const deployProperties = properties({});

    // Then the destination and every source key are read.
    assertIdentical(deployProperties.destinationBucketName, "site-bucket");
    assertArrayLength(deployProperties.sourceObjectKeys, 1);
    assertIdentical(deployProperties.sourceObjectKeys[0], "abc123.zip");
  });

  it("reads several source object keys", () => {
    // Given a deployment with more than one source.
    const deployProperties = properties({
      SourceObjectKeys: ["abc123.zip", "def456.zip"],
    });

    // Then all of them are kept, because a BucketDeployment can take several
    // sources and copy each into the same destination.
    assertArrayLength(deployProperties.sourceObjectKeys, 2);
  });

  it("keys files under the destination prefix", () => {
    // Given a deployment into a key prefix, which CDK synthesizes without a
    // trailing slash.
    const deployProperties = properties({
      DestinationBucketKeyPrefix: "assets",
    });

    // When a source file's Object key is built.
    // Then the prefix becomes a key prefix with the separator it needs.
    assertIdentical(deployProperties.objectKey("app.css"), "assets/app.css");
  });

  it("does not double the separator on a prefix that already ends in one", () => {
    // Given a deployment whose prefix was written with a trailing slash.
    const deployProperties = properties({
      DestinationBucketKeyPrefix: "assets/",
    });

    // Then the key has one separator, not two.
    assertIdentical(deployProperties.objectKey("app.css"), "assets/app.css");
  });

  it("keys files at the Bucket root with no prefix", () => {
    // Given a deployment with no key prefix.
    const deployProperties = properties({});

    // Then Object keys are the source paths as they stand.
    assertIdentical(deployProperties.objectKey("index.html"), "index.html");
  });

  it("treats an empty key prefix as no prefix", () => {
    // Given a deployment whose prefix resolved to an empty string.
    const deployProperties = properties({ DestinationBucketKeyPrefix: "" });

    // Then nothing is prepended, and no bare separator appears.
    assertIdentical(deployProperties.objectKey("index.html"), "index.html");
  });

  it("prunes unless the deployment says otherwise", () => {
    // Given deployments with each Prune setting, and one with none.
    // Then the construct's own default stands in for an absent property, which
    // is only synthesized when it is set.
    assertTrue(properties({}).prune);
    assertTrue(properties({ Prune: true }).prune);
    assertFalse(properties({ Prune: false }).prune);
  });

  it("refuses a Prune that is not a boolean", () => {
    // Given a deployment whose Prune resolved to something other than a
    // boolean, as a template substituting a parameter can leave it.
    // When the properties are read, then it is refused rather than read as
    // truthy: pruning deletes Objects, so "false" quietly meaning true would
    // delete the ones the template was keeping.
    assertStringIncludes(
      assertThrowsError(() => properties({ Prune: "false" })).message,
      "Custom::CDKBucketDeployment DeploySite: Prune must be a boolean",
    );
    assertStringIncludes(
      assertThrowsError(() => properties({ Prune: 0 })).message,
      "Prune must be a boolean",
    );
  });

  it("reads system metadata as the headers it sets", () => {
    // Given a deployment setting content headers on everything it copies.
    const deployProperties = properties({
      SystemMetadata: {
        "content-encoding": "br",
        "Cache-Control": "public, max-age=60",
      },
    });

    // Then each is kept under a lowercase name, as a stored Object holds it.
    assertIdentical(
      deployProperties.systemMetadata.get("content-encoding"),
      "br",
    );
    assertIdentical(
      deployProperties.systemMetadata.get("cache-control"),
      "public, max-age=60",
    );
  });

  it("reads the exclude and include filters", () => {
    // Given a deployment with both kinds of filter.
    const deployProperties = properties({
      Exclude: ["*"],
      Include: ["*.txt"],
    });

    // Then both lists are read, and an absent one is empty rather than missing.
    assertIdentical(deployProperties.exclude[0], "*");
    assertIdentical(deployProperties.include[0], "*.txt");
    const unfiltered = properties({});

    assertArrayLength(unfiltered.exclude, 0);
    assertArrayLength(unfiltered.include, 0);
  });

  it("refuses a destination Bucket name that did not resolve to a string", () => {
    // Given a deployment whose destination Bucket name is not a string.
    // When the properties are read, then it is refused by name.
    const error = assertThrowsError(() =>
      properties({ DestinationBucketName: 123 }),
    );

    assertStringIncludes(
      error.message,
      "Custom::CDKBucketDeployment DeploySite: DestinationBucketName must resolve to a string",
    );
  });

  it("refuses a key prefix that did not resolve to a string", () => {
    // Given a deployment whose key prefix is not a string.
    // When the properties are read, then it is refused by name.
    const error = assertThrowsError(() =>
      properties({ DestinationBucketKeyPrefix: ["assets"] }),
    );

    assertStringIncludes(
      error.message,
      "DestinationBucketKeyPrefix must resolve to a string",
    );
  });

  it("refuses a filter list that is not a list of strings", () => {
    // Given deployments whose filters are the wrong shape.
    // When the properties are read, then each is refused by name.
    assertStringIncludes(
      assertThrowsError(() => properties({ Exclude: "*" })).message,
      "Exclude must be an array of strings",
    );
    assertStringIncludes(
      assertThrowsError(() => properties({ Include: [123] })).message,
      "Include must be an array of strings",
    );
  });

  it("refuses system metadata that is not an object of strings", () => {
    // Given deployments whose system metadata is the wrong shape.
    // When the properties are read, then each is refused by name.
    assertStringIncludes(
      assertThrowsError(() => properties({ SystemMetadata: ["br"] })).message,
      "SystemMetadata must be an object",
    );
    assertStringIncludes(
      assertThrowsError(() =>
        properties({ SystemMetadata: { "content-encoding": 1 } }),
      ).message,
      "SystemMetadata content-encoding must be a string",
    );
  });
});
