import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnTemplateValue } from "../template/value/sim-cfn-template-value.js";
import type { SimCfnParameterDefinition } from "./sim-cfn-parameters.type.js";

/**
 * Deploy a template declaring one Parameter, and read back what the value
 * under test resolved to off the one Resource carrying it.
 */
async function resolvedProperty(
  parameter: SimCfnParameterDefinition,
  value: SimCfnTemplateValue,
  supplied?: string,
): Promise<SimCfnTemplateValue | undefined> {
  const stack = await new SimAws().cloudFormation().deployTemplate({
    stackName: "list-parameter-stack",
    template: {
      Parameters: { Names: parameter },
      Resources: {
        Handle: {
          Type: "AWS::CloudFormation::WaitConditionHandle",
          Properties: { Resolved: value },
        },
      },
    },
    ...(supplied !== undefined && { parameters: { Names: supplied } }),
  });
  const resource = stack.getResource("Handle");
  assertNonNullable(resource);

  return resource.properties["Resolved"];
}

describe("CloudFormation list Parameters", () => {
  it("joins a CommaDelimitedList Parameter's Default", async () => {
    // Given a CommaDelimitedList Parameter with a Default.
    // When a template joins a Ref to it.
    const joined = await resolvedProperty(
      { Type: "CommaDelimitedList", Default: "a,b,c" },
      { "Fn::Join": ["-", { Ref: "Names" }] },
    );

    // Then the members are joined with the delimiter.
    assertIdentical(joined, "a-b-c");
  });

  it("selects from a supplied List<AWS::EC2::Subnet::Id> value", async () => {
    // Given a subnet list Parameter supplied a value on deploy.
    // When a template selects from a Ref to it.
    const selected = await resolvedProperty(
      { Type: "List<AWS::EC2::Subnet::Id>" },
      { "Fn::Select": [1, { Ref: "Names" }] },
      "subnet-0a,subnet-0b",
    );

    // Then the second subnet is selected.
    assertIdentical(selected, "subnet-0b");
  });

  it("resolves a Ref to a list Parameter as a list", async () => {
    // Given a CommaDelimitedList Parameter.
    // When a property is set to a Ref to it.
    const resolved = await resolvedProperty(
      { Type: "CommaDelimitedList" },
      { Ref: "Names" },
      "test,dev,prod",
    );

    // Then the property holds the list of members.
    assertArrayEquals(resolved, ["test", "dev", "prod"]);
  });

  it("trims the spaces around each member", async () => {
    // Given a Default written with spaces after its commas.
    // When a property is set to a Ref to it.
    const resolved = await resolvedProperty(
      { Type: "CommaDelimitedList", Default: "10.0.48.0/24, 10.0.112.0/24 ," },
      { Ref: "Names" },
    );

    // Then each member is trimmed, and the trailing comma leaves an empty one.
    assertArrayEquals(resolved, ["10.0.48.0/24", "10.0.112.0/24", ""]);
  });

  it("resolves a List<Number> Parameter to strings", async () => {
    // Given a number list Parameter.
    // When a property is set to a Ref to it.
    const resolved = await resolvedProperty(
      { Type: "List<Number>" },
      { Ref: "Names" },
      "80,20",
    );

    // Then the members are strings, as CloudFormation gives them.
    assertArrayEquals(resolved, ["80", "20"]);
  });

  it("leaves a String Parameter holding commas as one string", async () => {
    // Given a String Parameter whose value contains commas.
    // When a property is set to a Ref to it.
    const resolved = await resolvedProperty(
      { Type: "String" },
      { Ref: "Names" },
      "a,b,c",
    );

    // Then the value is the string it was given.
    assertIdentical(resolved, "a,b,c");
  });
});
