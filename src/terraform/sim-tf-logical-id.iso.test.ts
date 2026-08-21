import { describe, it } from "vitest";
import { assertIdentical } from "@kensio/smartass";
import { TerraformLogicalIds } from "./sim-tf-logical-id.js";

describe("naming a Terraform address as a CloudFormation logical ID", () => {
  it("folds an address into one alphanumeric run", () => {
    // Given a resource inside a module
    const logicalIds = new TerraformLogicalIds([
      "module.uploads.aws_s3_bucket.this",
    ]);

    // When it is named
    // Then the separators a logical ID cannot hold are folded away
    assertIdentical(
      logicalIds.of("module.uploads.aws_s3_bucket.this"),
      "ModuleUploadsAwsS3BucketThis",
    );
  });

  it("numbers two addresses that fold into the same name", () => {
    // Given two addresses that differ only in a separator, which is what the
    // fold into one alphanumeric run loses
    const logicalIds = new TerraformLogicalIds([
      "aws_s3_bucket.fooBar",
      "aws_s3_bucket.foo_bar",
    ]);

    // When both are named
    // Then the first in address order keeps the name the address gives and
    // the second is numbered, rather than the plan being refused
    assertIdentical(logicalIds.of("aws_s3_bucket.fooBar"), "AwsS3BucketFooBar");
    assertIdentical(
      logicalIds.of("aws_s3_bucket.foo_bar"),
      "AwsS3BucketFooBar2",
    );
  });

  it("steps past a number an address arrived at on its own", () => {
    // Given a colliding pair whose numbered form is the name a third address
    // already has
    const logicalIds = new TerraformLogicalIds([
      "aws_sqs_queue.orders",
      "aws_sqs_queue.orders2",
      "aws_sqs_queue.orders_",
    ]);

    // When all three are named
    // Then the numbering skips the taken name, so no two share one
    assertIdentical(logicalIds.of("aws_sqs_queue.orders"), "AwsSqsQueueOrders");
    assertIdentical(
      logicalIds.of("aws_sqs_queue.orders2"),
      "AwsSqsQueueOrders2",
    );
    assertIdentical(
      logicalIds.of("aws_sqs_queue.orders_"),
      "AwsSqsQueueOrders3",
    );
  });

  it("names the for_each instances of one resource apart", () => {
    // Given two instances of a resource declared with for_each
    const logicalIds = new TerraformLogicalIds([
      'aws_s3_bucket.site["staging"]',
      'aws_s3_bucket.site["production"]',
    ]);

    // When both are named
    // Then the key each instance carries is part of its name
    assertIdentical(
      logicalIds.of('aws_s3_bucket.site["staging"]'),
      "AwsS3BucketSiteStaging",
    );
    assertIdentical(
      logicalIds.of('aws_s3_bucket.site["production"]'),
      "AwsS3BucketSiteProduction",
    );
  });

  it("names an address it was not built with as though it stood alone", () => {
    // Given a name asked for a resource outside the template
    const logicalIds = new TerraformLogicalIds([]);

    // When it is named
    // Then it is the name the address gives, with nothing to collide with
    assertIdentical(logicalIds.of("aws_sqs_queue.orders"), "AwsSqsQueueOrders");
  });

  it("falls back to a name for an address holding nothing to name it with", () => {
    // Given an address of separators alone
    const logicalIds = new TerraformLogicalIds(["..."]);

    // When it is named
    // Then it still gets a logical ID, since an empty one is not one
    assertIdentical(logicalIds.of("..."), "Resource");
  });
});
