import { describe, it } from "vitest";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
} from "@kensio/smartass";
import { terraformPlanResources } from "./sim-tf-plan-resources.js";

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
