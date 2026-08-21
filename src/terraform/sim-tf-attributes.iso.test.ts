import { describe, it } from "vitest";
import {
  assertFalse,
  assertIdentical,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { terraformPlanResourceFactory } from "../../test/terraform/plan/terraform-plan.factory.js";
import { terraformMappingContext as contextFor } from "../../test/terraform/plan/terraform-mapping-context.js";
import {
  attribute,
  block,
  blocks,
  renamed,
  tags,
  templateValue,
} from "./sim-tf-attributes.js";

describe("carrying a Terraform value into a template", () => {
  it("keeps a value that is false, zero or empty", () => {
    // Given the values a resource can be configured with that read as falsey
    // When each is carried into the template
    // Then each survives, because a resource was configured with it
    assertFalse(templateValue(false));
    assertIdentical(templateValue(0), 0);
    assertIdentical(templateValue(""), "");
  });

  it("drops a value the plan did not carry", () => {
    // Given an attribute the plan holds no value for
    // When it is carried into the template
    // Then nothing is carried
    assertUndefined(templateValue(null));
    assertUndefined(templateValue(undefined));
  });
});

describe("reading one attribute of a planned resource", () => {
  it("reads a value the plan resolved", () => {
    // Given a queue whose name Terraform worked out before writing the plan
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({ values: { name: "orders" } }),
      ],
    });

    // When the attribute is read
    // Then the value comes back as it is
    assertIdentical(attribute(context, "name"), "orders");
  });

  it("reads an unknown value as the reference behind it", () => {
    // Given a subscription whose topic ARN is unknown until the topic exists,
    // and a configuration recording what that attribute refers to
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_sns_topic_subscription",
          name: "orders",
          unknown: { topic_arn: true },
          references: {
            topic_arn: ["aws_sns_topic.events.arn", "aws_sns_topic.events"],
          },
        }),
        terraformPlanResourceFactory.make({
          type: "aws_sns_topic",
          name: "events",
        }),
      ],
    });

    // When the attribute is read
    // Then it is the intrinsic CloudFormation would have carried, taken from
    // the longest reference, which is the one naming the attribute
    assertObjectEquals(attribute(context, "topic_arn"), {
      Ref: "AwsSnsTopicEvents",
    });
  });

  it("reads nothing for an unknown value whose reference leads nowhere", () => {
    // Given an unknown attribute referring to a resource the plan does not
    // hold, such as one the configuration reads out of a data source
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          unknown: { name: true },
          references: { name: ["data.aws_caller_identity.current.account_id"] },
        }),
      ],
    });

    // When the attribute is read
    // Then nothing comes back, and the mapping decides what that means
    assertUndefined(attribute(context, "name"));
  });

  it("reads nothing for an unknown value the configuration says nothing about", () => {
    // Given an attribute the plan could not resolve and no expression declares,
    // which is what a value the provider generates looks like
    const context = contextFor({
      resources: [terraformPlanResourceFactory.make({ unknown: { id: true } })],
    });

    // When the attribute is read
    // Then nothing comes back
    assertUndefined(attribute(context, "id"));
  });
});

describe("reading the nested blocks of a planned resource", () => {
  it("reads a block the plan carries as a one-entry list", () => {
    // Given a table's ttl block, which the schema allows only one of and the
    // plan still writes as a list
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_dynamodb_table",
          name: "orders",
          values: { ttl: [{ attribute_name: "expiresAt", enabled: true }] },
        }),
      ],
    });

    // When the block is read
    // Then it is the one entry rather than the list around it
    assertObjectEquals(block(context, "ttl"), {
      attribute_name: "expiresAt",
      enabled: true,
    });
  });

  it("reads nothing for a block the resource does not declare", () => {
    // Given a resource with no such block
    const context = contextFor({
      resources: [terraformPlanResourceFactory.make({})],
    });

    // When the block is read
    // Then nothing comes back
    assertUndefined(block(context, "ttl"));
  });

  it("reads a map attribute as the record it already is", () => {
    // Given an attribute the plan carries as a map rather than as a list of
    // blocks, which is what a Terraform map attribute arrives as
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          values: { tags: { Application: "orders" } },
        }),
      ],
    });

    // When it is read as a block
    // Then the record comes back as it is
    assertObjectEquals(block(context, "tags"), { Application: "orders" });
  });

  it("reads nothing for a list holding something that is not a block", () => {
    // Given an attribute that is a list of strings rather than of blocks
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          values: { attribute: ["pk"] },
        }),
      ],
    });

    // When it is read as a block
    // Then nothing comes back, and nothing is read off a string as though it
    // were a block
    assertUndefined(block(context, "attribute"));
    assertObjectEquals(blocks(context, "attribute"), []);
  });

  it("reads every entry of a block that repeats", () => {
    // Given a table declaring three attributes
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_dynamodb_table",
          name: "orders",
          values: {
            attribute: [
              { name: "pk", type: "S" },
              { name: "sk", type: "S" },
            ],
          },
        }),
      ],
    });

    // When the blocks are read
    // Then every entry comes back
    assertObjectEquals(blocks(context, "attribute"), [
      { name: "pk", type: "S" },
      { name: "sk", type: "S" },
    ]);
  });
});

describe("carrying the tags of a planned resource", () => {
  it("reads the tags the provider merged its own defaults into", () => {
    // Given a resource whose tags and tags_all differ, which is what a
    // provider default_tags block does
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          values: {
            tags: { Application: "orders" },
            tags_all: { Application: "orders", ManagedBy: "terraform" },
          },
        }),
      ],
    });

    // When the tags are carried
    // Then it is tags_all, which is what ends up on the resource
    assertObjectEquals(tags(context), [
      { Key: "Application", Value: "orders" },
      { Key: "ManagedBy", Value: "terraform" },
    ]);
  });

  it("carries no tags for a resource tagged with none", () => {
    // Given a resource whose tag map is empty
    const context = contextFor({
      resources: [terraformPlanResourceFactory.make({ values: { tags: {} } })],
    });

    // When the tags are carried
    // Then nothing is carried, rather than an empty Tags list
    assertUndefined(tags(context));
  });
});

describe("renaming attributes into CloudFormation properties", () => {
  it("leaves out a property the plan holds no value for", () => {
    // Given a queue configured with a name and nothing else
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({ values: { name: "orders" } }),
      ],
    });

    // When the rename table is applied
    const properties = renamed(context, {
      QueueName: "name",
      DelaySeconds: "delay_seconds",
    });

    // Then only the property with a value behind it is there, so the Resource
    // is not declared with a property nothing configured
    assertObjectEquals(properties, { QueueName: "orders" });
  });
});
