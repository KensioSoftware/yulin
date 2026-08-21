import { describe, it } from "vitest";
import {
  assertIdentical,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import {
  terraformPlanFactory,
  terraformPlanModuleFactory,
  terraformPlanResourceFactory,
  type TerraformPlanFixture,
} from "../../test/terraform/plan/terraform-plan.factory.js";
import { terraformResourceFactory } from "../../test/terraform/plan/terraform-resource.factory.js";
import type { TerraformResource } from "./sim-tf-resource.type.js";
import { terraformPlanResources } from "./sim-tf-plan-resources.js";
import { terraformModuleOutputs } from "./sim-tf-module-outputs.js";
import { terraformModuleVariables } from "./sim-tf-module-variables.js";
import { TerraformReferenceResolver } from "./sim-tf-reference.js";
import { qualifiedReference } from "./sim-tf-reference-address.js";

/**
 * The resource a reference is read from, where only the module it sits in
 * matters. Every reference is written somewhere, and the resolver reads what
 * `each` iterates and which instance is meant off the resource that wrote it.
 */
function readingFrom(
  modulePath: readonly string[] = [],
  properties: Partial<TerraformResource> = {},
): TerraformResource {
  return terraformResourceFactory.make({ modulePath, ...properties });
}

/** A resolver over the resources one plan fixture declares. */
function resolverFor(
  fixture: Partial<TerraformPlanFixture>,
): TerraformReferenceResolver {
  const plan = terraformPlanFactory.make(fixture);

  return new TerraformReferenceResolver(
    terraformPlanResources(plan),
    terraformModuleOutputs(plan),
    terraformModuleVariables(plan),
  );
}

describe("qualifying a reference with the module it was read in", () => {
  it("prefixes a resource reference with the module path", () => {
    // Given a reference to a resource of the same module
    // When it is qualified against that module
    // Then it names the address planned_values gave the resource
    assertIdentical(
      qualifiedReference("aws_sqs_queue.this", ["processor"]),
      "module.processor.aws_sqs_queue.this",
    );
  });

  it("prefixes another module's output with the path it is read from", () => {
    // Given a nested module reading a sibling module's output
    // When it is qualified
    // Then it matches the key the module output index is stored under
    assertIdentical(
      qualifiedReference("module.queue.arn", ["app"]),
      "module.app.module.queue.arn",
    );
  });

  it("leaves a reference Terraform resolves itself alone", () => {
    // Given references naming a variable, a local and a for_each value
    // When each is qualified
    // Then none is given a module path, because no resource has that address
    for (const reference of ["var.name", "local.tags", "each.value.uri"]) {
      assertIdentical(qualifiedReference(reference, ["api"]), reference);
    }
  });
});

describe("resolving a Terraform reference against the resources of a plan", () => {
  it("reads an attribute off the Resource standing in for the resource", () => {
    // Given a plan holding a queue
    const resolver = resolverFor({
      resources: [terraformPlanResourceFactory.make({})],
    });

    // When a reference to the queue's ARN is resolved
    const resolved = resolver.resolve(
      "aws_sqs_queue.orders.arn",
      readingFrom(),
    );

    // Then it is the Fn::GetAtt CloudFormation reads that ARN with
    assertObjectEquals(resolved, {
      "Fn::GetAtt": ["AwsSqsQueueOrders", "Arn"],
    });
  });

  it("reads a reference naming a resource and no attribute as its Ref", () => {
    // Given a plan holding a queue
    const resolver = resolverFor({
      resources: [terraformPlanResourceFactory.make({})],
    });

    // When a reference naming the resource itself is resolved
    // Then it is the Ref, which for a queue is its URL
    assertObjectEquals(
      resolver.resolve("aws_sqs_queue.orders", readingFrom()),
      {
        Ref: "AwsSqsQueueOrders",
      },
    );
  });

  it("reads an attribute whose Ref is not the same value as CloudFormation's", () => {
    // Given a topic, whose Terraform arn attribute is the value an
    // AWS::SNS::Topic answers a Ref with
    const resolver = resolverFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_sns_topic",
          name: "events",
        }),
      ],
    });

    // When the ARN is resolved
    // Then it comes back as a Ref rather than an Fn::GetAtt, because the two
    // services disagree about which value a Ref answers with
    assertObjectEquals(
      resolver.resolve("aws_sns_topic.events.arn", readingFrom()),
      {
        Ref: "AwsSnsTopicEvents",
      },
    );
  });

  it("resolves a reference made inside a module against that module", () => {
    // Given a queue declared in a module, referred to by a resource of the
    // same module, which names it without the module prefix
    const resolver = resolverFor({
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

    // When the reference is resolved from inside that module
    // Then it reaches the resource planned_values addressed with the prefix
    assertObjectEquals(
      resolver.resolve("aws_sqs_queue.this.arn", readingFrom(["processing"])),
      { "Fn::GetAtt": ["ModuleProcessingAwsSqsQueueThis", "Arn"] },
    );
  });

  it("follows a module output to the resource behind it", () => {
    // Given a module publishing its queue's ARN as an output
    const resolver = resolverFor({
      modules: [
        terraformPlanModuleFactory.make({
          name: "processing",
          resources: [
            terraformPlanResourceFactory.make({
              address: "aws_sqs_queue.this",
              name: "this",
            }),
          ],
          outputs: { queue_arn: ["aws_sqs_queue.this.arn"] },
        }),
      ],
    });

    // When the root module's reference to that output is resolved
    const resolved = resolver.resolve(
      "module.processing.queue_arn",
      readingFrom(),
    );

    // Then it reads the attribute the output's own expression names, off the
    // Resource the module's queue became. No address of the plan is
    // module.processing.queue_arn, so nothing but the output leads there
    assertObjectEquals(resolved, {
      "Fn::GetAtt": ["ModuleProcessingAwsSqsQueueThis", "Arn"],
    });
  });

  it("resolves a reference between resources of a for_each module instance", () => {
    // Given a module called once per colour, holding a queue
    const resolver = resolverFor({
      modules: [
        terraformPlanModuleFactory.make({
          name: "workers",
          index: "blue",
          resources: [
            terraformPlanResourceFactory.make({
              address: "aws_sqs_queue.this",
              name: "this",
            }),
          ],
        }),
      ],
    });

    // When a sibling of that queue resolves a reference to it
    const resolved = resolver.resolve(
      "aws_sqs_queue.this.arn",
      readingFrom(['workers["blue"]']),
    );

    // Then it reaches the instance's own queue. Every address under the module
    // carries the key, so a reference qualified without it reaches nothing
    assertObjectEquals(resolved, {
      "Fn::GetAtt": ["ModuleWorkersBlueAwsSqsQueueThis", "Arn"],
    });
  });

  it("resolves nothing for a reference to a resource the template lacks", () => {
    // Given a plan whose template will hold no resource of that address
    const resolver = resolverFor({ resources: [] });

    // When a reference to it is resolved
    // Then nothing comes back, rather than an intrinsic naming a logical ID
    // the template never declares
    assertUndefined(
      resolver.resolve("aws_sqs_queue.orders.arn", readingFrom()),
    );
    assertUndefined(
      resolver.targetAddress("aws_sqs_queue.orders.arn", readingFrom()),
    );
  });

  it("resolves nothing for an attribute with no way to read it", () => {
    // Given a queue, and a reference to an attribute CloudFormation has no
    // equivalent of
    const resolver = resolverFor({
      resources: [terraformPlanResourceFactory.make({})],
    });

    // When the reference is resolved
    // Then nothing comes back, and the mapping decides what that means
    assertUndefined(
      resolver.resolve("aws_sqs_queue.orders.policy", readingFrom()),
    );
  });

  it("names the resource a reference points at, for a caller that wants it", () => {
    // Given a queue
    const resolver = resolverFor({
      resources: [terraformPlanResourceFactory.make({})],
    });

    // When the resource behind a reference to its ARN is asked for
    // Then the address comes back, which is what a fold merging into that
    // resource needs rather than the value read off it
    assertIdentical(
      resolver.targetAddress("aws_sqs_queue.orders.arn", readingFrom()),
      "aws_sqs_queue.orders",
    );
  });
});

describe("resolving a reference through module outputs", () => {
  it("resolves nothing for an output whose expression names nothing", () => {
    // Given a module output declared with a constant rather than a reference
    const resolver = resolverFor({
      modules: [
        terraformPlanModuleFactory.make({
          name: "processing",
          outputs: { queue_name: [] },
        }),
      ],
    });

    // When the output is resolved
    // Then nothing comes back, since no resource of the plan is behind it
    assertUndefined(
      resolver.resolve("module.processing.queue_name", readingFrom()),
    );
  });

  it("follows an output read from inside a for_each module instance", () => {
    // Given a module called once per colour, whose own module publishes a
    // queue ARN, and a reference to that output made from inside the instance
    const queue = terraformPlanModuleFactory.make({
      name: "queue",
      resources: [
        terraformPlanResourceFactory.make({
          address: "aws_sqs_queue.this",
          name: "this",
        }),
      ],
      outputs: { queue_arn: ["aws_sqs_queue.this.arn"] },
    });
    const resolver = resolverFor({
      modules: [
        terraformPlanModuleFactory.make({
          name: "workers",
          index: "blue",
          modules: [queue],
        }),
      ],
    });

    // When the output is resolved from inside the instance
    const resolved = resolver.resolve(
      "module.queue.queue_arn",
      readingFrom(['workers["blue"]']),
    );

    // Then it is found. A module declares its outputs once however many
    // instances the call has, so the index is keyed without the key
    assertObjectEquals(resolved, {
      "Fn::GetAtt": ["ModuleWorkersBlueModuleQueueAwsSqsQueueThis", "Arn"],
    });
  });

  it("gives up on an output that leads back to itself", () => {
    // Given an output whose expression, qualified with the module that
    // declares it, is the output's own address. Following one output is
    // resolving its expression a module down, and this is the shape where
    // that leads nowhere new
    const resolver = resolverFor({
      modules: [
        terraformPlanModuleFactory.make({
          name: "processing",
          outputs: { queue_arn: ["queue_arn"] },
        }),
      ],
    });

    // When it is resolved
    // Then it stops rather than following itself forever
    assertUndefined(
      resolver.resolve("module.processing.queue_arn", readingFrom()),
    );
  });
});
