import { describe, it } from "vitest";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
} from "@kensio/smartass";
import {
  terraformPlanFactory,
  terraformPlanModuleFactory,
  terraformPlanResourceFactory,
} from "../../test/terraform/plan/terraform-plan.factory.js";
import { terraformPlanResources } from "./sim-tf-plan-resources.js";

describe("reading the resources of a Terraform plan", () => {
  it("reads a resource declared with for_each as one resource per instance", () => {
    // Given a bucket declared with for_each over two environments, which
    // Terraform expands before it writes the plan
    const plan = terraformPlanFactory.make({
      resources: ["staging", "production"].map((environment) =>
        terraformPlanResourceFactory.make({
          address: `aws_s3_bucket.site["${environment}"]`,
          type: "aws_s3_bucket",
          name: "site",
          index: environment,
          values: { bucket: `orders-site-${environment}` },
        }),
      ),
    });

    // When the plan is read
    const resources = terraformPlanResources(plan);

    // Then each instance is a resource of its own, carrying its own values
    assertArrayEquals(
      resources.map((resource) => resource.address),
      ['aws_s3_bucket.site["staging"]', 'aws_s3_bucket.site["production"]'],
    );
    assertArrayEquals(
      resources.map((resource) => resource.values["bucket"]),
      ["orders-site-staging", "orders-site-production"],
    );
  });

  it("reaches a resource a child module declares", () => {
    // Given a queue declared inside a module the root module calls
    const plan = terraformPlanFactory.make({
      modules: [
        terraformPlanModuleFactory.make({
          name: "processing",
          resources: [
            terraformPlanResourceFactory.make({
              address: "aws_sqs_queue.this",
              name: "this",
            }),
          ],
        }),
      ],
    });

    // When the plan is read
    const [resource] = terraformPlanResources(plan);

    // Then it carries the address planned_values gave it, and the module path
    // its configuration was declared under
    assertNonNullable(resource);
    assertIdentical(resource.address, "module.processing.aws_sqs_queue.this");
    assertArrayEquals(resource.modulePath, ["processing"]);
  });

  it("reaches a resource a module nested in another module declares", () => {
    // Given a module whose own module declares the resource
    const queue = terraformPlanModuleFactory.make({
      name: "queue",
      resources: [
        terraformPlanResourceFactory.make({
          address: "aws_sqs_queue.this",
          name: "this",
        }),
      ],
    });
    const plan = terraformPlanFactory.make({
      modules: [
        terraformPlanModuleFactory.make({ name: "app", modules: [queue] }),
      ],
    });

    // When the plan is read
    const [resource] = terraformPlanResources(plan);

    // Then the call path is read off the address a module repeats its parents
    // in, rather than off the last segment of it
    assertNonNullable(resource);
    assertIdentical(
      resource.address,
      "module.app.module.queue.aws_sqs_queue.this",
    );
    assertArrayEquals(resource.modulePath, ["app", "queue"]);
  });

  it("joins what a plan says about one resource in three places", () => {
    // Given a resource whose values, unknown attributes and references are in
    // planned_values, resource_changes and configuration
    const plan = terraformPlanFactory.make({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_lambda_permission",
          name: "allow_bucket",
          values: { function_name: "orders-processor" },
          unknown: { source_arn: true },
          references: {
            source_arn: ["aws_s3_bucket.uploads.arn", "aws_s3_bucket.uploads"],
          },
          dependsOn: ["aws_cloudwatch_log_group.processor"],
        }),
      ],
    });

    // When the plan is read
    const [resource] = terraformPlanResources(plan);

    // Then one resource carries all three
    assertNonNullable(resource);
    assertObjectEquals(resource.values, { function_name: "orders-processor" });
    assertObjectEquals(resource.unknown, { source_arn: true });
    assertObjectEquals(resource.expressions, {
      source_arn: {
        references: ["aws_s3_bucket.uploads.arn", "aws_s3_bucket.uploads"],
      },
    });
    assertArrayEquals(resource.dependsOn, [
      "aws_cloudwatch_log_group.processor",
    ]);
  });

  it("names the provider a resource type belongs to", () => {
    // Given a resource from a provider other than AWS
    const plan = terraformPlanFactory.make({
      resources: [
        terraformPlanResourceFactory.make({
          type: "random_password",
          name: "database",
          provider: "hashicorp/random",
        }),
      ],
    });

    // When the plan is read
    const [resource] = terraformPlanResources(plan);

    // Then the provider is named without the registry it was fetched from, so
    // a caller can report it rather than silently lose it
    assertNonNullable(resource);
    assertIdentical(resource.provider, "hashicorp/random");
  });

  it("reads nothing from a document holding no planned values", () => {
    // Given a plan that would create nothing at all
    // When it is read
    // Then there are no resources, rather than an error
    assertArrayLength(terraformPlanResources({}), 0);
  });
});

/*
 * A plan document says less than a full one whenever there is less to say. An
 * apply of nothing but a data source has no `configuration` for a managed
 * resource, a provider that generates a value writes a `resource_changes`
 * entry with no `after` at all, and a resource configured with nothing carries
 * no `values`. Every one of these is a document Terraform writes, so reading
 * one is reading a plan rather than tolerating a broken file.
 */
describe("reading a plan document that says less than a full one", () => {
  it("reads a resource whose configuration the document does not hold", () => {
    // Given planned values with no configuration section beside them
    const plan = {
      planned_values: {
        root_module: {
          resources: [
            {
              address: "aws_sqs_queue.orders",
              type: "aws_sqs_queue",
              name: "orders",
              provider_name: "registry.terraform.io/hashicorp/aws",
            },
          ],
        },
      },
    };

    // When it is read
    const [resource] = terraformPlanResources(plan);

    // Then the resource is there, with nothing it refers to and no values
    assertNonNullable(resource);
    assertObjectEquals(resource.values, {});
    assertObjectEquals(resource.unknown, {});
    assertObjectEquals(resource.expressions, {});
    assertArrayEquals(resource.dependsOn, []);
  });

  it("leaves out a data source, which creates nothing", () => {
    // Given a plan holding a data source beside a managed resource
    const plan = {
      planned_values: {
        root_module: {
          resources: [
            {
              address: "data.aws_caller_identity.current",
              mode: "data",
              type: "aws_caller_identity",
              name: "current",
            },
            {
              address: "aws_sqs_queue.orders",
              mode: "managed",
              type: "aws_sqs_queue",
              name: "orders",
            },
          ],
        },
      },
    };

    // When it is read
    // Then only the managed resource is there, because a data source reads
    // infrastructure that already exists
    assertArrayEquals(
      terraformPlanResources(plan).map((resource) => resource.type),
      ["aws_sqs_queue"],
    );
  });

  it("names the provider of a resource the document does not name one for", () => {
    // Given a resource with no provider on it
    const plan = {
      planned_values: {
        root_module: {
          resources: [{ address: "thing.one", type: "thing", name: "one" }],
        },
      },
    };

    // When it is read
    // Then the provider is unknown rather than absent, so the resource is
    // still reported rather than passing as an AWS one
    const [resource] = terraformPlanResources(plan);
    assertNonNullable(resource);
    assertIdentical(resource.provider, "unknown");
  });

  it("reads a plan whose changes say nothing about a resource", () => {
    // Given a resource_changes entry carrying no change at all
    const plan = {
      planned_values: {
        root_module: {
          resources: [
            {
              address: "aws_sqs_queue.orders",
              type: "aws_sqs_queue",
              name: "orders",
            },
          ],
        },
      },
      resource_changes: [
        {
          address: "aws_sqs_queue.orders",
          type: "aws_sqs_queue",
          name: "orders",
        },
      ],
    };

    // When it is read
    // Then no attribute is unknown, rather than the entry being read as one
    const [resource] = terraformPlanResources(plan);
    assertNonNullable(resource);
    assertObjectEquals(resource.unknown, {});
  });

  it("reads a child module the document does not address", () => {
    // Given a child module with no address on it
    const plan = {
      planned_values: {
        root_module: {
          child_modules: [
            {
              resources: [
                {
                  address: "module.processing.aws_sqs_queue.this",
                  type: "aws_sqs_queue",
                  name: "this",
                },
              ],
            },
          ],
        },
      },
    };

    // When it is read
    // Then its resources are still reached, under a call path with nothing to
    // name the call with
    const [resource] = terraformPlanResources(plan);
    assertNonNullable(resource);
    assertArrayEquals(resource.modulePath, [""]);
  });

  it("reads a module the configuration holds nothing for", () => {
    // Given a child module with no matching module call in the configuration
    const plan = {
      planned_values: {
        root_module: {
          child_modules: [
            {
              address: "module.processing",
              resources: [
                {
                  address: "module.processing.aws_sqs_queue.this",
                  type: "aws_sqs_queue",
                  name: "this",
                },
              ],
            },
          ],
        },
      },
      configuration: { root_module: {} },
    };

    // When it is read
    // Then the module's resource is still reached, with nothing recorded
    // about what it refers to
    const [resource] = terraformPlanResources(plan);
    assertNonNullable(resource);
    assertArrayEquals(resource.modulePath, ["processing"]);
    assertObjectEquals(resource.expressions, {});
  });
});
