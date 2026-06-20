import {
  assertFalse,
  assertIdentical,
  assertThrowsError,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCfnParameters } from "./sim-cfn-parameters.js";

describe("SimCfnParameters", () => {
  it("accepts empty Parameters", () => {
    const parameters = new SimCfnParameters();

    assertFalse(parameters.has("BucketName"));
  });

  it("records defined CloudFormation Parameters", () => {
    const parameters = new SimCfnParameters({
      definitions: {
        BucketName: {
          Type: "String",
        },
        Environment: {
          Type: "String",
        },
      },
    });

    assertTrue(parameters.has("BucketName"));
    assertTrue(parameters.has("Environment"));
    assertFalse(parameters.has("MissingParameter"));
  });

  it("resolves CloudFormation Parameter default values", () => {
    const parameters = new SimCfnParameters({
      definitions: {
        BucketName: {
          Type: "String",
          Default: "default-bucket-name",
        },
      },
    });

    assertIdentical(parameters.value("BucketName"), "default-bucket-name");
  });

  it("resolves explicit Parameter values", () => {
    const parameters = new SimCfnParameters({
      definitions: {
        BucketName: {
          Type: "String",
        },
      },
      values: {
        BucketName: "override-bucket-name",
      },
    });

    assertIdentical(parameters.value("BucketName"), "override-bucket-name");
  });

  it("prefers explicit Parameter values over defaults", () => {
    const parameters = new SimCfnParameters({
      definitions: {
        BucketName: {
          Type: "String",
          Default: "default-bucket-name",
        },
      },
      values: {
        BucketName: "override-bucket-name",
      },
    });

    assertIdentical(parameters.value("BucketName"), "override-bucket-name");
  });

  it("records explicit Parameter values even when they are not defined in the template", () => {
    const parameters = new SimCfnParameters({
      values: {
        ExternalParameter: "external-value",
      },
    });

    assertFalse(parameters.has("ExternalParameter"));
    assertIdentical(parameters.value("ExternalParameter"), "external-value");
  });

  it("creates Parameters from already-normalized values", () => {
    const parameters = SimCfnParameters.fromValues(
      {
        BucketName: "override-bucket-name",
      },
      {
        definitions: {
          BucketName: {
            Type: "String",
          },
        },
      },
    );

    assertTrue(parameters.has("BucketName"));
    assertIdentical(parameters.value("BucketName"), "override-bucket-name");
  });

  it("creates Parameters from command-style input", () => {
    const parameters = SimCfnParameters.fromInput(
      {
        Parameters: [
          {
            ParameterKey: "BucketName",
            ParameterValue: "override-bucket-name",
          },
          {
            ParameterKey: "Environment",
            ParameterValue: "test",
          },
        ],
      },
      {
        definitions: {
          BucketName: {
            Type: "String",
          },
          Environment: {
            Type: "String",
          },
        },
      },
    );

    assertTrue(parameters.has("BucketName"));
    assertTrue(parameters.has("Environment"));
    assertIdentical(parameters.value("BucketName"), "override-bucket-name");
    assertIdentical(parameters.value("Environment"), "test");
  });

  it("ignores incomplete command-style Parameter input entries", () => {
    const parameters = SimCfnParameters.fromInput({
      Parameters: [
        {
          ParameterKey: "BucketName",
          ParameterValue: "override-bucket-name",
        },
        {
          ParameterKey: "MissingValue",
        },
        {
          ParameterValue: "missing-key-value",
        },
      ],
    });

    assertIdentical(parameters.value("BucketName"), "override-bucket-name");

    const missingValueError = assertThrowsError(() => {
      parameters.value("MissingValue");
    });

    assertIdentical(
      missingValueError.message,
      "Sim CloudFormation Stack unknown parameter MissingValue is missing a value",
    );

    const missingKeyError = assertThrowsError(() => {
      parameters.value("missing-key-value");
    });

    assertIdentical(
      missingKeyError.message,
      "Sim CloudFormation Stack unknown parameter missing-key-value is missing a value",
    );
  });

  it("copies existing values when adding definitions", () => {
    const parameters = SimCfnParameters.fromValues({
      BucketName: "override-bucket-name",
    });

    const parametersWithDefinitions = parameters.withDefinitions({
      BucketName: {
        Type: "String",
        Default: "default-bucket-name",
      },
      Environment: {
        Type: "String",
        Default: "test",
      },
    });

    assertFalse(parameters.has("BucketName"));
    assertTrue(parametersWithDefinitions.has("BucketName"));
    assertTrue(parametersWithDefinitions.has("Environment"));
    assertIdentical(
      parametersWithDefinitions.value("BucketName"),
      "override-bucket-name",
    );
    assertIdentical(parametersWithDefinitions.value("Environment"), "test");
  });

  it("throws when a defined Parameter has no value", () => {
    const parameters = new SimCfnParameters({
      stackName: "TestStack",
      definitions: {
        BucketName: {
          Type: "String",
        },
      },
    });

    const error = assertThrowsError(() => {
      parameters.value("BucketName");
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Stack TestStack parameter BucketName is missing a value",
    );
  });

  it("throws when an unknown Parameter value is requested", () => {
    const parameters = new SimCfnParameters({
      stackName: "TestStack",
    });

    const error = assertThrowsError(() => {
      parameters.value("BucketName");
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Stack TestStack parameter BucketName is missing a value",
    );
  });

  it("throws when a CloudFormation Parameter definition is not an object", () => {
    const error = assertThrowsError(() => {
      new SimCfnParameters({
        stackName: "TestStack",
        definitions: {
          // @ts-expect-error -- testing bad input
          BucketName: "not-a-parameter-definition",
        },
      });
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Stack TestStack parameter BucketName definition must be an object",
    );
  });

  it("ignores non-string default values", () => {
    const parameters = new SimCfnParameters({
      stackName: "TestStack",
      definitions: {
        NumberValue: {
          Type: "Number",
          Default: 123,
        },
      },
    });

    const error = assertThrowsError(() => {
      parameters.value("NumberValue");
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Stack TestStack parameter NumberValue is missing a value",
    );
  });

  it("uses unknown stack name in errors when no stack name is provided", () => {
    const parameters = new SimCfnParameters({
      definitions: {
        BucketName: {
          Type: "String",
        },
      },
    });

    const error = assertThrowsError(() => {
      parameters.value("BucketName");
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Stack unknown parameter BucketName is missing a value",
    );
  });
});
