/* oxlint-disable no-template-curly-in-string -- Fn::Sub syntax, not JavaScript templates. */
import {
  assertArrayLength,
  assertIdentical,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { jsonStringify } from "../../../util/type-guard/json.js";
import { SimCfnTemplate } from "./sim-cfn-template.js";

describe("SimCfnTemplate.fromTemplateBody", () => {
  it("reads a body written as JSON", () => {
    // Given a template body written as JSON, the way CDK synthesizes one.
    const body = jsonStringify({
      Resources: {
        TestBucket: {
          Type: "AWS::S3::Bucket",
        },
      },
    });

    // When it is read as a template body.
    const template = SimCfnTemplate.fromTemplateBody(body);

    // Then the Resource the template declares is there.
    const resourceTemplates = template.resourceTemplates();

    assertArrayLength(resourceTemplates, 1);
    assertIdentical(resourceTemplates[0].logicalId, "TestBucket");
    assertObjectMatches(resourceTemplates[0].template, {
      Type: "AWS::S3::Bucket",
    });
  });

  it("reads a body written as YAML", () => {
    // Given the same template written as YAML, which carries no name to say
    // which of the two formats it is in.
    const body = ["Resources:", "  TestBucket:", "    Type: AWS::S3::Bucket"];

    // When it is read as a template body.
    const template = SimCfnTemplate.fromTemplateBody(body.join("\n"));

    // Then it holds what the JSON template holds.
    const resourceTemplates = template.resourceTemplates();

    assertArrayLength(resourceTemplates, 1);
    assertIdentical(resourceTemplates[0].logicalId, "TestBucket");
    assertObjectMatches(resourceTemplates[0].template, {
      Type: "AWS::S3::Bucket",
    });
  });

  it("resolves a short-form tag the way a template file resolves one", () => {
    // Given a YAML body calling an intrinsic by its short-form tag.
    const body = [
      "Resources:",
      "  WorkQueue:",
      "    Type: AWS::SQS::Queue",
      "    Properties:",
      '      QueueName: !Sub "${AWS::StackName}-work"',
    ];

    // When it is read as the body of a named Stack.
    const template = SimCfnTemplate.fromTemplateBody(body.join("\n"), {
      stackName: "work-stack",
    });

    // Then the tag resolved to what its long form resolves to.
    const resourceTemplates = template.resourceTemplates();

    assertArrayLength(resourceTemplates, 1);
    assertObjectMatches(resourceTemplates[0].template, {
      Type: "AWS::SQS::Queue",
      Properties: { QueueName: "work-stack-work" },
    });
  });

  it("refuses a body that is neither JSON nor YAML, naming both attempts", () => {
    // Given a body no parser can make a template of.
    const body = "Resources: [ unclosed";

    // When it is read as the body of a named Stack.
    const error = assertThrowsError(() => {
      SimCfnTemplate.fromTemplateBody(body, { stackName: "TestStack" });
    });

    // Then the Stack is named, along with what each format made of the body.
    assertStringIncludes(
      error.message,
      "Sim CloudFormation Stack TestStack TemplateBody must be valid JSON or YAML",
    );
    assertStringIncludes(error.message, "as JSON,");
    assertStringIncludes(error.message, "as YAML,");
  });

  it("throws a clear error when TemplateBody does not parse to an object", () => {
    const error = assertThrowsError(() => {
      SimCfnTemplate.fromTemplateBody("null", {
        stackName: "TestStack",
      });
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Stack TestStack TemplateBody must parse to an object",
    );
  });

  it("throws a clear error when TemplateBody is missing Resources", () => {
    const error = assertThrowsError(() => {
      SimCfnTemplate.fromTemplateBody(jsonStringify({}), {
        stackName: "TestStack",
      });
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Stack TestStack TemplateBody must include a Resources object",
    );
  });

  it("throws a clear error when TemplateBody Resources is not an object", () => {
    const error = assertThrowsError(() => {
      SimCfnTemplate.fromTemplateBody(
        jsonStringify({
          Resources: ["not", "a", "resources", "object"],
        }),
        {
          stackName: "TestStack",
        },
      );
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Stack TestStack TemplateBody Resources must be an object",
    );
  });
});
