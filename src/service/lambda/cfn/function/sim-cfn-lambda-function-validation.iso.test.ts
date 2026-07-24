import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimLambdaCloudFormationResourceFactory } from "../sim-cfn-lambda-resource-factory.js";

/**
 * Attempt a Function creation with the given properties and return the
 * validation error it rejects with.
 */
async function functionCreationError(
  properties: SimCfnTemplateValueRecord,
): Promise<Error> {
  const simAws = new SimAws();
  const resource = new SimCfnResource({
    accountRegionScope: {
      accountId: "111111111111" as SimAwsAccountId,
      regionName: "eu-west-2",
    },
    logicalId: "BadFunction",
    template: {
      Type: "AWS::Lambda::Function",
      Properties: properties,
    },
  });
  const factory = new SimLambdaCloudFormationResourceFactory(simAws.lambda());

  try {
    await factory.create("Function", resource, {
      simAws,
      resources: new Map(),
    });
  } catch (error) {
    assertInstanceOf(error, Error);
    return error;
  }

  throw new Error("Expected Function creation to reject");
}

const validProperties: SimCfnTemplateValueRecord = {
  Role: "arn:aws:iam::111111111111:role/BadFunctionRole",
  Code: {
    ZipFile: "exports.handler = async () => 'ok';",
  },
  Handler: "index.handler",
};

async function assertRejectsProperty(
  overrides: SimCfnTemplateValueRecord,
  expectedMessage: string,
): Promise<void> {
  const error = await functionCreationError({
    ...validProperties,
    ...overrides,
  });

  assertInstanceOf(error, TypeError);
  assertIdentical(
    error.message,
    `Invalid AWS::Lambda::Function BadFunction: ${expectedMessage}`,
  );
}

describe("Lambda CloudFormation Function property validation", () => {
  it("rejects a missing or non-string Role", async () => {
    // Given Function properties without a Role, or with a non-string Role.
    // When creation is attempted, then each rejects with an AWS-like
    // diagnostic naming the property and the logical ID.
    const missingRoleError = await functionCreationError({
      Code: validProperties["Code"] ?? {},
      Handler: "index.handler",
    });

    assertInstanceOf(missingRoleError, TypeError);
    assertIdentical(
      missingRoleError.message,
      "Invalid AWS::Lambda::Function BadFunction: Role must be a string",
    );

    await assertRejectsProperty({ Role: 123 }, "Role must be a string");
  });

  it("rejects non-string string-typed properties", async () => {
    // Given Function properties where string-typed values have other types.
    // When creation is attempted, then each rejects naming the property.
    await assertRejectsProperty(
      { FunctionName: 42 },
      "FunctionName must be a string",
    );
    await assertRejectsProperty(
      { Handler: ["index.handler"] },
      "Handler must be a string",
    );
    await assertRejectsProperty(
      { Runtime: { name: "nodejs20.x" } },
      "Runtime must be a string",
    );
    await assertRejectsProperty(
      { Description: false },
      "Description must be a string",
    );
  });

  it("rejects a missing Code property with the AWS-like create error", async () => {
    // Given Function properties without any Code.
    // When creation is attempted, then the CreateFunction handler rejects it
    // with its AWS-like required Code diagnostic.
    const error = await functionCreationError({
      Role: "arn:aws:iam::111111111111:role/BadFunctionRole",
      Handler: "index.handler",
    });

    assertStringIncludes(error.message, "Code required");
  });

  it("rejects a malformed Code property", async () => {
    // Given Function properties where Code is not an object.
    // When creation is attempted, then each rejects naming the property.
    await assertRejectsProperty(
      { Code: "exports.handler = async () => 'ok';" },
      "Code must be an object",
    );
    await assertRejectsProperty({ Code: [] }, "Code must be an object");
    await assertRejectsProperty({ Code: null }, "Code must be an object");
  });

  it("rejects malformed Code source values", async () => {
    // Given Function Code where source values have the wrong types.
    // When creation is attempted, then each rejects naming the property.
    await assertRejectsProperty(
      { Code: { ZipFile: 123 } },
      "Code.ZipFile must be a string",
    );
    await assertRejectsProperty(
      { Code: { S3Bucket: 123, S3Key: "greeter.zip" } },
      "Code.S3Bucket must be a string",
    );
    await assertRejectsProperty(
      { Code: { S3Bucket: "code-bucket", S3Key: 123 } },
      "Code.S3Key must be a string",
    );
    await assertRejectsProperty(
      { Code: { S3Bucket: "code-bucket", S3Key: "k", S3ObjectVersion: 1 } },
      "Code.S3ObjectVersion must be a string",
    );
  });

  it("rejects non-number number-typed properties", async () => {
    // Given Function properties where number-typed values have other types.
    // When creation is attempted, then each rejects naming the property.
    await assertRejectsProperty({ Timeout: "10" }, "Timeout must be a number");
    await assertRejectsProperty(
      { MemorySize: "256" },
      "MemorySize must be a number",
    );
  });
});
