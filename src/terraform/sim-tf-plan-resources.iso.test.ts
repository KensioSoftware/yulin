import { describe, it } from "vitest";
import {
  assertArrayEmpty,
  assertArrayEquals,
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

  it("keeps the instance key of a module called with for_each", () => {
    // Given a module called once per environment, whose instances Terraform
    // addresses with the key
    const plan = terraformPlanFactory.make({
      modules: ["blue", "green"].map((colour) =>
        terraformPlanModuleFactory.make({
          name: "workers",
          index: colour,
          resources: [
            terraformPlanResourceFactory.make({
              address: "aws_sqs_queue.this",
              name: "this",
            }),
          ],
        }),
      ),
    });

    // When the plan is read
    const resources = terraformPlanResources(plan);

    // Then the module path carries the key, because that is the form every
    // address under the module is written with, and a reference made inside it
    // has to be qualified against that form to reach anything
    assertArrayEquals(
      resources.map((resource) => resource.modulePath.join(".")),
      ['workers["blue"]', 'workers["green"]'],
    );
    assertArrayEquals(
      resources.map((resource) => resource.address),
      [
        'module.workers["blue"].aws_sqs_queue.this',
        'module.workers["green"].aws_sqs_queue.this',
      ],
    );
  });

  it("reads the configuration of a module called with for_each once", () => {
    // Given a for_each module whose resource declares a reference. The
    // configuration files a module under the name it was called by, once,
    // however many instances the call has
    const plan = terraformPlanFactory.make({
      modules: [
        terraformPlanModuleFactory.make({
          name: "workers",
          index: 0,
          resources: [
            terraformPlanResourceFactory.make({
              address: "aws_sqs_queue.this",
              name: "this",
              references: { name: ["var.name"] },
            }),
          ],
        }),
      ],
    });

    // When the plan is read
    const [resource] = terraformPlanResources(plan);

    // Then the instance still finds the configuration, which is filed under
    // the call name with no key on it
    assertNonNullable(resource);
    assertArrayEquals(resource.modulePath, ["workers[0]"]);
    assertObjectEquals(resource.expressions, {
      name: { references: ["var.name"] },
    });
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
    assertArrayEmpty(terraformPlanResources({}));
  });
});
