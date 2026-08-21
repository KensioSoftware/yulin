import { describe, it } from "vitest";
import {
  assertFalse,
  assertIdentical,
  assertUndefined,
} from "@kensio/smartass";
import { templateValue } from "./sim-tf-attributes.js";
import { qualifiedReference } from "./sim-tf-reference-address.js";

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
