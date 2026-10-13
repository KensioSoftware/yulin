import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../sim-cfn-template.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../value/sim-cfn-template-value.js";

/**
 * A template whose one Resource carries the value under test as a property,
 * so whatever it resolved to is read back off the Resource.
 */
function templateJoining(
  value: SimCfnTemplateValue,
  extra: SimCfnTemplateValueRecord = {},
): CfnTemplateBodyRecord {
  return {
    ...extra,
    Resources: {
      Handle: {
        Type: "AWS::CloudFormation::WaitConditionHandle",
        Properties: { Joined: value },
      },
    },
  };
}

async function joinedProperty(
  template: CfnTemplateBodyRecord,
): Promise<SimCfnTemplateValue | undefined> {
  const stack = await new SimAws().cloudFormation().deployTemplate({
    stackName: "join-stack",
    template,
  });
  const resource = stack.getResource("Handle");
  assertNonNullable(resource);

  return resource.properties["Joined"];
}

describe("CloudFormation Fn::Join of a list a function returns", () => {
  it("joins a hosted zone's NameServers into a Stack Output", async () => {
    // Given a template joining a hosted zone's nameservers, as CDK writes
    // Fn.join(",", zone.hostedZoneNameServers).
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "join-list",
      template: {
        Resources: {
          Zone: {
            Type: "AWS::Route53::HostedZone",
            Properties: { Name: "example.test" },
          },
        },
        Outputs: {
          NameServers: {
            Value: {
              "Fn::Join": [",", { "Fn::GetAtt": ["Zone", "NameServers"] }],
            },
          },
        },
      },
    });

    // Then the Output holds the four nameservers in one string.
    assertIdentical(
      stack.outputs.get("NameServers")?.value,
      "ns-1.sim-aws.localhost,ns-2.sim-aws.localhost," +
        "ns-3.sim-aws.localhost,ns-4.sim-aws.localhost",
    );
  });

  it("joins the list Fn::Split returns", async () => {
    // Given a join over a split.
    const template = templateJoining({
      "Fn::Join": ["-", { "Fn::Split": [",", "a,b,c"] }],
    });

    // When the template is deployed.
    const joined = await joinedProperty(template);

    // Then the split values are joined with the new delimiter.
    assertIdentical(joined, "a-b-c");
  });

  it("joins a list value Fn::FindInMap reads from a mapping", async () => {
    // Given a mapping holding a list, and a join over the lookup.
    const template = templateJoining(
      {
        "Fn::Join": ["/", { "Fn::FindInMap": ["Paths", "Site", "Segments"] }],
      },
      {
        Mappings: {
          Paths: { Site: { Segments: ["assets", "images", "icons"] } },
        },
      },
    );

    // When the template is deployed.
    const joined = await joinedProperty(template);

    // Then the mapped list is joined.
    assertIdentical(joined, "assets/images/icons");
  });

  it("joins the list Fn::If chooses", async () => {
    // Given a join over a condition choosing between two literal lists.
    const template = templateJoining(
      {
        "Fn::Join": [
          ".",
          { "Fn::If": ["IsProd", ["www", "example"], ["dev", "example"]] },
        ],
      },
      {
        Parameters: { Env: { Type: "String", Default: "prod" } },
        Conditions: { IsProd: { "Fn::Equals": [{ Ref: "Env" }, "prod"] } },
      },
    );

    // When the template is deployed.
    const joined = await joinedProperty(template);

    // Then the chosen list is joined.
    assertIdentical(joined, "www.example");
  });

  it("refuses a function that resolves to a string", async () => {
    // Given a join whose values argument is a Ref to a String Parameter.
    const template = templateJoining(
      { "Fn::Join": ["-", { Ref: "Name" }] },
      { Parameters: { Name: { Type: "String", Default: "only" } } },
    );

    // When the template is deployed.
    const error = await assertThrowsErrorAsync(async () =>
      joinedProperty(template),
    );

    // Then it is refused for not being a list.
    assertInstanceOf(error, TypeError);
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource Handle value at Properties.Joined: " +
        "Sim CloudFormation Fn::Join values must resolve to a list, got string",
    );
  });

  it("refuses a list nested inside the joined list", async () => {
    // Given a literal list whose entry is itself a list from Fn::Split.
    const template = templateJoining({
      "Fn::Join": ["-", ["a", { "Fn::Split": [",", "b,c"] }]],
    });

    // When the template is deployed.
    const error = await assertThrowsErrorAsync(async () =>
      joinedProperty(template),
    );

    // Then the nested list is refused, as CloudFormation does not flatten it.
    assertInstanceOf(error, TypeError);
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource Handle value at Properties.Joined: " +
        "Sim CloudFormation Fn::Join values must each resolve to a string, got list",
    );
  });
});
