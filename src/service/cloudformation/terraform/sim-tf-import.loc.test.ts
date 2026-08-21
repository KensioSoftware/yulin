import { describe, it } from "vitest";
import {
  assertArrayIncludes,
  assertArrayLength,
  assertArrayMinLength,
  assertIdentical,
  assertNonNullable,
  assertObjectHasProperty,
} from "@kensio/smartass";
import { SimAws } from "../../aws/sim-aws.js";
import { TestTerraformProject } from "../../../util/filesystem/test-terraform-project.js";
import { cfnTemplateFromTerraformPlan } from "./sim-tf-template.js";
import type { TerraformPlan } from "./sim-tf-plan.type.js";

/*
 * The community modules read `aws_caller_identity`, which cannot be read
 * without credentials, so planning that configuration offline reports those
 * data sources as errors and still plans the managed resources.
 */
const toleratedDataSourceFailures = new Set(["modules"]);

async function planned(name: string): Promise<TerraformPlan> {
  const project = new TestTerraformProject(name, {
    toleratesDataSourceErrors: toleratedDataSourceFailures.has(name),
  });

  return (await project.planJson()) as TerraformPlan;
}

describe("importing a Terraform plan", () => {
  it("accounts for every managed resource of a plan", async () => {
    // Given plan JSON for an application and for one built from modules
    const app = cfnTemplateFromTerraformPlan(await planned("app")).report;
    const modules = cfnTemplateFromTerraformPlan(
      await planned("modules"),
    ).report;

    // When each resource is mapped, folded into another, or skipped
    // Then the three add up to the plan's managed resource count
    for (const report of [app, modules]) {
      assertIdentical(
        report.mapped.length + report.folded.length + report.skipped.length,
        report.total,
      );
      assertArrayMinLength(report.mapped, 10);
    }
  });

  it("deploys the resources a plan built from community modules declares", async () => {
    // Given plan JSON whose resources all come from published modules
    const { template } = cfnTemplateFromTerraformPlan(await planned("modules"));

    // When it is deployed as a CloudFormation template
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-modules",
      template,
      bindings: [
        {
          functionName: "orders-processor-independent",
          handler: (): { ok: boolean } => ({ ok: true }),
        },
      ],
    });

    // Then the simulated resources the modules declared exist
    assertNonNullable(
      simAws.s3().getSimBucketByName("orders-uploads-independent"),
    );
    assertNonNullable(simAws.dynamoDb().findTable("orders-independent"));
    assertArrayLength(stack.skippedResources, 0);
  });

  it("folds the aws_s3_bucket_ resources into the bucket they configure", async () => {
    // Given plan JSON declaring a bucket, and its versioning, public access
    // block and CORS as four more resources of their own
    const { template, report } = cfnTemplateFromTerraformPlan(
      await planned("app"),
    );

    // When the plan is imported
    const bucket = template.Resources["AwsS3BucketUploads"] as {
      Properties: Record<string, unknown>;
    };

    // Then one AWS::S3::Bucket carries what the four declared separately
    assertObjectHasProperty(bucket.Properties, "VersioningConfiguration");
    assertObjectHasProperty(
      bucket.Properties,
      "PublicAccessBlockConfiguration",
    );
    assertObjectHasProperty(bucket.Properties, "CorsConfiguration");
    assertObjectHasProperty(bucket.Properties, "BucketEncryption");

    // And the four are reported as folded rather than as resources of their own
    assertArrayIncludes(
      report.folded.map((entry) => entry.type),
      "aws_s3_bucket_versioning",
    );
  });

  it("rebuilds the ordering Terraform resolved out of the plan", async () => {
    // Given a permission naming a function the same plan creates. Terraform
    // resolves the name, so the value carries no reference to order from
    const { template } = cfnTemplateFromTerraformPlan(await planned("app"));

    // When the plan is imported
    const permission = template.Resources["AwsLambdaPermissionAllowBucket"] as {
      DependsOn?: readonly string[];
    };

    // Then the edge is recovered from the references the configuration records
    assertArrayIncludes(
      permission.DependsOn ?? [],
      "AwsLambdaFunctionProcessor",
    );
  });

  it("cannot recover an inline IAM policy that names a resource of the same plan", async () => {
    // Given plan JSON whose role policy is built with jsonencode over an ARN
    const { report } = cfnTemplateFromTerraformPlan(await planned("app"));

    // When the plan is imported
    const lost = report.lost.map((entry) => entry.attribute);

    // Then the policy document is recorded as lost rather than guessed at,
    // because Terraform resolves nothing inside a string it could not build
    assertArrayIncludes(lost, "environment.variables");
    assertArrayMinLength(report.lost, 1);
  });
});
