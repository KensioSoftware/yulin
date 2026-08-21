import { describe, it } from "vitest";
import {
  assertArrayIncludes,
  assertArrayLength,
  assertArrayMinLength,
  assertIdentical,
  assertNonNullable,
  assertObjectHasProperty,
} from "@kensio/smartass";
import { SimAws } from "../service/aws/sim-aws.js";
import { TestTerraformProject } from "../util/filesystem/test-terraform-project.js";
import { TerraformAdapter } from "./sim-tf-adapter.js";
import { deployedStackObject } from "../service/cloudformation/stack/sim-cfn-stack.fixture.js";

/*
 * These run against plans Terraform produces from the configurations under
 * `test/terraform`, rather than against a fixture. Every mechanism of the
 * import has a fixture of its own beside it. These cover the one thing a
 * fixture cannot say, which is that the format being read is the format
 * Terraform writes.
 *
 * The community modules read `aws_caller_identity`, which cannot be read
 * without credentials, so planning that configuration offline reports those
 * data sources as errors and still plans the managed resources.
 */
const toleratedDataSourceFailures = new Set(["modules"]);

/** The function each configuration declares, by configuration name. */
const functionNames: Record<string, string> = {
  app: "orders-processor",
  modules: "orders-processor-independent",
};

/**
 * What the functions of one configuration run.
 *
 * A plan points a function at a zip, an S3 object or a container image, and
 * none of the three is a handler Yulin can run, so a plan holding a function
 * is deployed with a binding matched on the name the plan declares.
 */
function handlersFor(
  name: string,
): readonly { functionName: string; handler: () => { ok: boolean } }[] {
  return [
    {
      // oxlint-disable-next-line security/detect-object-injection
      functionName: functionNames[name] ?? "",
      handler: (): { ok: boolean } => ({ ok: true }),
    },
  ];
}

async function plannedPath(name: string): Promise<string> {
  const project = new TestTerraformProject(name, {
    toleratesDataSourceErrors: toleratedDataSourceFailures.has(name),
  });

  return await project.planJsonPath();
}

describe("deploying a plan Terraform itself produced", () => {
  it("deploys an application configuration into simulated AWS", async () => {
    // Given the plan JSON for a hand-written application configuration
    const planPath = await plannedPath("app");

    // When it is deployed
    const simAws = new SimAws();
    const { stack } = await new TerraformAdapter(simAws).deployPlan({
      planPath,
      stackName: "orders-app",
      bindings: handlersFor("app"),
    });

    // Then the simulated resources the configuration declared exist, and no
    // Resource of the template it built was one CloudFormation had to skip
    assertNonNullable(simAws.s3().getSimBucketByName("orders-uploads"));
    assertNonNullable(simAws.dynamoDb().findTable("orders-orders"));
    assertNonNullable(simAws.sqs().findQueue("orders-processing"));
    assertArrayLength(stack.skippedResources, 0);
  });

  it("deploys a configuration built out of community modules", async () => {
    // Given plan JSON whose resources all come from published modules, so
    // nothing about the configuration was chosen for what Yulin supports
    const planPath = await plannedPath("modules");

    // When it is deployed
    const simAws = new SimAws();
    const { stack } = await new TerraformAdapter(simAws).deployPlan({
      planPath,
      stackName: "orders-modules",
      bindings: handlersFor("modules"),
    });

    // Then the resources the modules declared, several modules deep, exist
    assertNonNullable(
      simAws.s3().getSimBucketByName("orders-uploads-independent"),
    );
    assertNonNullable(simAws.dynamoDb().findTable("orders-independent"));
    assertArrayLength(stack.skippedResources, 0);
  });

  it("accounts for every managed resource of a plan", async () => {
    // Given both plans deployed
    const adapter = new TerraformAdapter(new SimAws());
    const deployments = await Promise.all(
      ["app", "modules"].map(async (name) =>
        adapter.deployPlan({
          planPath: await plannedPath(name),
          stackName: `counted-${name}`,
          bindings: handlersFor(name),
        }),
      ),
    );

    // When each resource is mapped, folded into another, or skipped
    // Then the three add up to the plan's managed resource count
    for (const { report } of deployments) {
      assertIdentical(
        report.mapped.length + report.folded.length + report.skipped.length,
        report.total,
      );
      assertArrayMinLength(report.mapped, 10);
    }
  });

  it("folds the aws_s3_bucket_ resources into the bucket they configure", async () => {
    // Given a configuration declaring a bucket, and its versioning, public
    // access block, CORS and encryption as four more resources of their own
    const { stack, report } = await new TerraformAdapter(
      new SimAws(),
    ).deployPlan({
      planPath: await plannedPath("app"),
      stackName: "folded-app",
      bindings: handlersFor("app"),
    });

    // The parsed template is not on the surface a deployment answers with,
    // and the folded properties are what this test is about.
    const bucket = deployedStackObject(stack).template.Resources[
      "AwsS3BucketUploads"
    ] as unknown as { Properties: Record<string, unknown> };

    // When the plan is deployed
    // Then one AWS::S3::Bucket carries what the five declared separately
    assertObjectHasProperty(bucket.Properties, "VersioningConfiguration");
    assertObjectHasProperty(
      bucket.Properties,
      "PublicAccessBlockConfiguration",
    );
    assertObjectHasProperty(bucket.Properties, "CorsConfiguration");
    assertObjectHasProperty(bucket.Properties, "BucketEncryption");
    assertArrayIncludes(
      report.folded.map((entry) => entry.type),
      "aws_s3_bucket_versioning",
    );
  });

  it("cannot recover a value Terraform collapsed into an unknown composite", async () => {
    // Given a configuration whose function reads a queue URL and a table name
    // into its environment. Terraform marks the whole variables map unknown,
    // and the variable names go with it
    const { report } = await new TerraformAdapter(new SimAws()).deployPlan({
      planPath: await plannedPath("app"),
      stackName: "lost-app",
      bindings: handlersFor("app"),
    });

    // When the plan is deployed
    const lost = report.lost.map((entry) => entry.attribute);

    // Then it is recorded as lost rather than guessed at, because Terraform
    // resolves nothing inside a value it could not build
    assertArrayIncludes(lost, "environment.variables");
  });
});
