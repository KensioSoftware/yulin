import { describe, it } from "vitest";
import {
  assertArrayEquals,
  assertArrayLength,
  assertObjectEquals,
} from "@kensio/smartass";
import type { SimCfnTemplateValueRecord } from "../template/value/sim-cfn-template-value.js";
import { pruneDanglingReferences } from "./sim-tf-template-prune.js";
import { referencedLogicalIds } from "./sim-tf-template-references.js";

describe("pruning what points at a Resource the template does not declare", () => {
  it("removes a Resource whose property names a Resource that is absent", () => {
    // Given a route whose target reads an integration the template dropped
    const templates = new Map<string, SimCfnTemplateValueRecord>([
      ["Api", { Type: "AWS::ApiGatewayV2::Api", Properties: {} }],
      [
        "Route",
        {
          Type: "AWS::ApiGatewayV2::Route",
          Properties: { Target: { Ref: "Integration" } },
        },
      ],
    ]);

    // When the template is pruned
    const { removed } = pruneDanglingReferences(templates);

    // Then the route goes and the API stays
    assertArrayEquals(removed, ["Route"]);
    assertArrayEquals(templates.keys().toArray(), ["Api"]);
  });

  it("removes a Resource stranded by the removal of another", () => {
    // Given a stage reading a route that itself reads an absent integration
    const templates = new Map<string, SimCfnTemplateValueRecord>([
      ["Route", { Type: "R", Properties: { Target: { Ref: "Integration" } } }],
      ["Stage", { Type: "S", Properties: { For: { Ref: "Route" } } }],
    ]);

    // When the template is pruned
    const { removed } = pruneDanglingReferences(templates);

    // Then both go, because removing the route strands the stage
    assertArrayLength(removed, 2);
    assertArrayLength(templates.keys().toArray(), 0);
  });

  it("drops a dangling DependsOn and keeps the Resource holding it", () => {
    // Given a bucket ordered after a Resource the template does not declare
    const templates = new Map<string, SimCfnTemplateValueRecord>([
      [
        "Bucket",
        { Type: "AWS::S3::Bucket", Properties: {}, DependsOn: ["Gone"] },
      ],
    ]);

    // When the template is pruned
    pruneDanglingReferences(templates);

    // Then the ordering hint goes and the bucket stays, because DependsOn is
    // an ordering hint rather than a value the Resource needs
    assertObjectEquals(templates.get("Bucket"), {
      Type: "AWS::S3::Bucket",
      Properties: {},
    });
  });
});

describe("finding the logical IDs a property names", () => {
  it("reads a Ref and an Fn::GetAtt at any depth", () => {
    // Given a property holding both intrinsics inside nested structure
    const properties = {
      Environment: { Variables: { Table: { Ref: "Orders" } } },
      Role: { "Fn::GetAtt": ["Processor", "Arn"] },
      Target: { "Fn::Join": ["", ["integrations/", { Ref: "Integration" }]] },
    };

    // When the names are collected
    const named = referencedLogicalIds(properties);

    // Then every referenced Resource is found
    assertArrayEquals(
      named.toSorted((a, b) => a.localeCompare(b)),
      ["Integration", "Orders", "Processor"],
    );
  });
});
