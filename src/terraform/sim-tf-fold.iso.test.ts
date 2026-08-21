import { describe, it } from "vitest";
import { assertArrayEquals, assertObjectEquals } from "@kensio/smartass";
import {
  terraformPlanFactory,
  terraformPlanResourceFactory,
  type TerraformPlanFixture,
} from "../../test/terraform/plan/terraform-plan.factory.js";
import {
  cfnTemplateFromTerraformPlan,
  type TerraformImportResult,
} from "./sim-tf-import.js";

/** The template and report one plan fixture imports as. */
function imported(
  fixture: Partial<TerraformPlanFixture>,
): TerraformImportResult {
  return cfnTemplateFromTerraformPlan(terraformPlanFactory.make(fixture));
}

/*
 * The AWS provider splits one CloudFormation Resource across several Terraform
 * resources, and a fold is how those are put back together. What a fold has to
 * decide is which Resource it belongs to, and it decides that from the
 * reference its parent attribute holds rather than from the bucket or role
 * name, which is a value that may not exist yet.
 */
describe("folding a resource into the Resource it configures", () => {
  it("folds a resource that configures another into the Resource it configures", () => {
    // Given a bucket, and its versioning declared as a resource of its own
    const { template, report } = imported({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_s3_bucket",
          name: "uploads",
          values: { bucket: "orders-uploads" },
        }),
        terraformPlanResourceFactory.make({
          type: "aws_s3_bucket_versioning",
          name: "uploads",
          values: { versioning_configuration: [{ status: "Enabled" }] },
          references: {
            bucket: ["aws_s3_bucket.uploads.id", "aws_s3_bucket.uploads"],
          },
        }),
      ],
    });

    // When the plan is imported
    // Then one AWS::S3::Bucket carries what the two declared separately
    assertObjectEquals(template.Resources["AwsS3BucketUploads"], {
      Type: "AWS::S3::Bucket",
      Properties: {
        BucketName: "orders-uploads",
        VersioningConfiguration: { Status: "Enabled" },
      },
    });
    assertArrayEquals(
      report.folded.map((entry) => entry.type),
      ["aws_s3_bucket_versioning"],
    );
  });

  it("records a fold whose target the template does not declare", () => {
    // Given the versioning resource with no bucket in the plan to fold into
    const { report } = imported({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_s3_bucket_versioning",
          name: "uploads",
          values: { versioning_configuration: [{ status: "Enabled" }] },
          references: {
            bucket: ["aws_s3_bucket.uploads.id", "aws_s3_bucket.uploads"],
          },
        }),
      ],
    });

    // When the plan is imported
    // Then it is recorded rather than lost, so the report still adds up
    assertObjectEquals(report.skipped, [
      {
        address: "aws_s3_bucket_versioning.uploads",
        type: "aws_s3_bucket_versioning",
        reason: "fold target not found",
      },
    ]);
  });

  it("records a fold whose parent attribute refers to nothing", () => {
    // Given a versioning resource whose bucket attribute the configuration
    // records no reference for, which is what naming a bucket by a literal
    // string looks like
    const { report } = imported({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_s3_bucket",
          name: "uploads",
          values: { bucket: "orders-uploads" },
        }),
        terraformPlanResourceFactory.make({
          type: "aws_s3_bucket_versioning",
          name: "uploads",
          values: {
            bucket: "orders-uploads",
            versioning_configuration: [{ status: "Enabled" }],
          },
        }),
      ],
    });

    // When the plan is imported
    // Then it is recorded rather than merged into a bucket guessed at by name
    assertArrayEquals(
      report.skipped.map((entry) => entry.reason),
      ["fold target not found"],
    );
  });
});
