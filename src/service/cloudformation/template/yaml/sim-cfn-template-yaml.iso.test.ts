/* oxlint-disable no-template-curly-in-string -- Fn::Sub syntax, not JavaScript templates. */
import {
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { parseSimCfnTemplateYaml } from "./sim-cfn-template-yaml.js";

describe("parsing a CloudFormation template written as YAML", () => {
  it("reads each short-form tag as the object its long form is written as", () => {
    // Given a template calling every intrinsic the simulator parses, written
    // with the short-form tag a hand-written template uses.
    const body = [
      "Conditions:",
      "  IsProd: !Equals [!Ref Stage, prod]",
      "  IsNotProd: !Not [!Condition IsProd]",
      "  IsEither: !Or [!Condition IsProd, !Condition IsNotProd]",
      "  IsBoth: !And [!Condition IsProd, !Condition IsEither]",
      "Resources:",
      "  Work:",
      "    Type: AWS::SQS::Queue",
      "    Properties:",
      '      QueueName: !Sub "${AWS::StackName}-work"',
      '      Label: !Join ["-", [!Ref Stage, work]]',
      '      Prefix: !Select [0, !Split ["-", !Ref Stage]]',
      "      Region: !FindInMap [Regions, !Ref Stage, name]",
      "      Retention: !If [IsProd, 14, 1]",
      "      DeadLetter: !ImportValue shared-dead-letter",
      "      Upstream: !ImportValue",
      '        Fn::Sub: "${AWS::StackName}-upstream"',
      "Outputs:",
      "  QueueArn:",
      "    Value: !GetAtt Work.Arn",
      "  QueueName:",
      "    Value: !GetAtt [Work, QueueName]",
    ].join("\n");

    // When it is parsed as YAML.
    const template = parseSimCfnTemplateYaml(body);

    // Then every tag holds what the same template written as JSON holds.
    assertObjectEquals(template, {
      Conditions: {
        IsProd: { "Fn::Equals": [{ Ref: "Stage" }, "prod"] },
        IsNotProd: { "Fn::Not": [{ Condition: "IsProd" }] },
        IsEither: {
          "Fn::Or": [{ Condition: "IsProd" }, { Condition: "IsNotProd" }],
        },
        IsBoth: {
          "Fn::And": [{ Condition: "IsProd" }, { Condition: "IsEither" }],
        },
      },
      Resources: {
        Work: {
          Type: "AWS::SQS::Queue",
          Properties: {
            QueueName: { "Fn::Sub": "${AWS::StackName}-work" },
            Label: { "Fn::Join": ["-", [{ Ref: "Stage" }, "work"]] },
            Prefix: {
              "Fn::Select": [0, { "Fn::Split": ["-", { Ref: "Stage" }] }],
            },
            Region: { "Fn::FindInMap": ["Regions", { Ref: "Stage" }, "name"] },
            Retention: { "Fn::If": ["IsProd", 14, 1] },
            DeadLetter: { "Fn::ImportValue": "shared-dead-letter" },
            Upstream: {
              "Fn::ImportValue": { "Fn::Sub": "${AWS::StackName}-upstream" },
            },
          },
        },
      },
      Outputs: {
        QueueArn: { Value: { "Fn::GetAtt": "Work.Arn" } },
        QueueName: { Value: { "Fn::GetAtt": ["Work", "QueueName"] } },
      },
    });
  });

  it("reads a short-form tag holding a list the way its long form reads one", () => {
    // Given a template whose Fn::Sub carries the variables it substitutes,
    // which is the list form of a tag the example above writes as a scalar.
    const body = [
      "Resources:",
      "  Work:",
      "    Type: AWS::SQS::Queue",
      "    Properties:",
      '      QueueName: !Sub ["${prefix}-work", { prefix: !Ref Stage }]',
    ].join("\n");

    // When it is parsed as YAML.
    const template = parseSimCfnTemplateYaml(body);

    // Then the list and everything nested in it is there as written.
    assertObjectEquals(template.Resources["Work"], {
      Type: "AWS::SQS::Queue",
      Properties: {
        QueueName: {
          "Fn::Sub": ["${prefix}-work", { prefix: { Ref: "Stage" } }],
        },
      },
    });
  });

  it("refuses a tag for an intrinsic this simulation has no behaviour for", () => {
    // Given a template calling an intrinsic function the simulator does not
    // parse in its long form either.
    const body = [
      "Resources:",
      "  Work:",
      "    Type: AWS::SQS::Queue",
      "    Properties:",
      "      QueueName: !Base64 work",
    ].join("\n");

    // When it is parsed as YAML.
    const error = assertThrowsError(() => parseSimCfnTemplateYaml(body));

    // Then the tag is refused by name, rather than the template deploying with
    // the bare value the tag was written against.
    assertStringIncludes(error.message, "Unresolved tag: !Base64");
  });

  it("refuses a file that is not YAML, saying where it stopped", () => {
    // Given a file whose contents are not a YAML document.
    const body = "Resources:\n  Work:\n Type: AWS::SQS::Queue\n";

    // When it is parsed as YAML.
    const error = assertThrowsError(() => parseSimCfnTemplateYaml(body));

    // Then the parse failure is what comes back.
    assertStringIncludes(error.message, "All mapping items");
  });

  it("refuses YAML holding something other than template sections", () => {
    // Given a file that is YAML but is not a mapping, as a note left where a
    // template was expected is.
    const body = "a template goes here\n";

    // When it is parsed as YAML.
    const error = assertThrowsError(() => parseSimCfnTemplateYaml(body));

    // Then it is refused for its shape rather than read as a template with no
    // sections in it.
    assertStringIncludes(
      error.message,
      "a template must be a mapping of template sections",
    );
  });
});
