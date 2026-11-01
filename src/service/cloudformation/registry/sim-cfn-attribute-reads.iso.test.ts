import { assertIdentical, assertSetSize } from "@kensio/smartass";
import { describe, it } from "vitest";
import { simCfnAttributeReads } from "./sim-cfn-attribute-reads.js";

describe("the Resources a template reads an attribute of", () => {
  it("finds each form of Fn::GetAtt and Fn::Sub in Resources and Outputs", () => {
    // Given a template reading attributes in every form.
    const template = {
      Resources: {
        Reader: {
          Type: "AWS::SNS::Topic",
          Properties: {
            TopicName: { "Fn::GetAtt": ["Long", "Name"] },
            DisplayName: { "Fn::GetAtt": "Short.Name" },
          },
        },
      },
      Outputs: {
        // oxlint-disable-next-line no-template-curly-in-string -- Fn::Sub syntax, not a JavaScript template.
        Url: { Value: { "Fn::Sub": "https://${Sub.DomainName}/" } },
        Mapped: {
          Value: {
            // oxlint-disable-next-line no-template-curly-in-string -- Fn::Sub syntax, not a JavaScript template.
            "Fn::Sub": ["${Mapped.Arn}/${Var.Name}", { "Var.Name": "x" }],
          },
        },
      },
    };

    // When the reads are listed.
    const reads = simCfnAttributeReads(template);

    // Then every Resource named is read, and the Sub variable is not.
    assertIdentical(
      [...reads].toSorted((left, right) => left.localeCompare(right)).join(","),
      "Long,Mapped,Short,Sub",
    );
  });

  it("leaves out Refs, pseudo parameters, escaped text and odd shapes", () => {
    // Given a template whose Subs read no attribute.
    const template = {
      Resources: {
        Topic: {
          Type: "AWS::SNS::Topic",
          Properties: {
            TopicName: { Ref: "Other" },
            // oxlint-disable-next-line no-template-curly-in-string -- Fn::Sub syntax, not a JavaScript template.
            DisplayName: { "Fn::Sub": "${AWS::Region}-${!Literal.Text}" },
          },
        },
      },
      Outputs: {
        Odd: { Value: { "Fn::Sub": [{ Ref: "Other" }] } },
        Bad: { Value: { "Fn::GetAtt": [{ Ref: "Other" }, "Arn"] } },
      },
    };

    // When the reads are listed.
    const reads = simCfnAttributeReads(template);

    // Then there are none.
    assertSetSize(reads, 0);
  });

  it("reads nothing from a template with no Outputs", () => {
    // Given an empty template. When the reads are listed. Then there are none.
    assertSetSize(simCfnAttributeReads({ Resources: {} }), 0);
  });
});
