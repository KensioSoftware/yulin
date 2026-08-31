import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimCfnResource } from "../sim-cfn-resource.js";

/**
 * A Resource of the given type, with nothing else on it.
 */
function makeResource(logicalId: string, type?: string): SimCfnResource {
  const simAws = new SimAws();

  return new SimCfnResource({
    accountRegionScope: simAws.accountRegionScope().accountRegionScope,
    logicalId,
    template: type === undefined ? {} : { Type: type },
  });
}

describe("SimCfnResource ignored properties", () => {
  it("records an ignored property against the Resource that declared it", () => {
    // Given a Bucket Resource.
    const resource = makeResource("SiteBucket", "AWS::S3::Bucket");

    // When its service reports creating it without a property.
    resource.ignoreProperty(
      "ReplicationConfiguration",
      "Bucket replication is not simulated",
    );

    // Then the record names the Resource, its type, the property and why.
    assertArrayLength(resource.ignoredProperties, 1);
    const ignored = resource.ignoredProperties[0];
    assertNonNullable(ignored);
    assertIdentical(ignored.logicalId, "SiteBucket");
    assertIdentical(ignored.resourceType, "AWS::S3::Bucket");
    assertIdentical(ignored.path, "ReplicationConfiguration");
    assertIdentical(ignored.reason, "Bucket replication is not simulated");
  });

  it("keeps one record of a property two levels of a parse both noticed", () => {
    // Given a Resource whose property is reported twice with the same reason,
    // as a nested shape read through two rules would.
    const resource = makeResource("Orders", "AWS::DynamoDB::Table");

    // When the same omission is recorded twice, and a different one once.
    resource.ignoreProperty("Replicas.0.Region", "replication not simulated");
    resource.ignoreProperty("Replicas.0.Region", "replication not simulated");
    resource.ignoreProperty("Replicas.0.Region", "and for another reason");

    // Then the repeat is dropped and the genuinely different one is kept.
    assertArrayLength(resource.ignoredProperties, 2);
  });

  it("forgets what an earlier creation attempt ignored", () => {
    // Given a Resource that recorded an ignored property while creating.
    const resource = makeResource("SiteBucket", "AWS::S3::Bucket");
    resource.ignoreProperty("Tags", "tags are not simulated");

    // When the Resource starts creating again.
    resource.markCreateInProgress();

    // Then the record is of this attempt only, rather than every attempt so
    // far.
    assertArrayEmpty(resource.ignoredProperties);
  });

  it("records an empty type for a Resource that declares none", () => {
    // Given a Resource template with no Type at all.
    const resource = makeResource("Untyped");

    // When a property is ignored on it.
    resource.ignoreProperty("Anything", "nothing reads this");

    // Then the record still names the property, with no type to name.
    const ignored = resource.ignoredProperties[0];
    assertNonNullable(ignored);
    assertIdentical(ignored.resourceType, "");
  });
});
