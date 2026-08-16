import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoSchemaAttributeType } from "../../user-pool/schema/sim-cognito-schema-attribute.js";

/**
 * A `Schema` this simulation refuses, with what its refusal has to say.
 *
 * Every one of these is a declaration real Cognito refuses too, so a pool that
 * could not have been created on AWS is not created here either.
 *
 * They are written in the simulator's own input shape rather than the SDK's,
 * because one of them names an attribute type the SDK's own types do not
 * have, and a request carrying it is exactly what the refusal is for.
 */
interface RefusedSchema {
  readonly label: string;
  readonly schema: readonly SimCognitoSchemaAttributeType[];
  readonly says: string;
}

const refusedSchemas: readonly RefusedSchema[] = [
  {
    label: "an attribute with no name",
    schema: [{ AttributeDataType: "String" }],
    says: "needs a Name",
  },
  {
    label: "an attribute naming its own custom prefix",
    schema: [{ Name: "custom:userId", AttributeDataType: "String" }],
    says: "names its own prefix",
  },
  {
    label: "an attribute naming the developer prefix",
    schema: [{ Name: "dev:userId", AttributeDataType: "String" }],
    says: "names its own prefix",
  },
  {
    label: "a name longer than Cognito allows",
    schema: [{ Name: "a".repeat(21), AttributeDataType: "String" }],
    says: "at most 20 characters",
  },
  {
    label: "an attribute type Cognito does not have",
    schema: [{ Name: "userId", AttributeDataType: "Uuid" }],
    says: "is not a Cognito attribute type",
  },
  {
    label: "a required custom attribute",
    schema: [{ Name: "userId", AttributeDataType: "String", Required: true }],
    says: "is Required, which Cognito refuses",
  },
  {
    label: "a developer-only attribute",
    schema: [
      {
        Name: "userId",
        AttributeDataType: "String",
        DeveloperOnlyAttribute: true,
      },
    ],
    says: "is not simulated",
  },
  {
    label: "number bounds on a string attribute",
    schema: [
      {
        Name: "userId",
        AttributeDataType: "String",
        NumberAttributeConstraints: { MinValue: "1" },
      },
    ],
    says: "only a Number attribute takes",
  },
  {
    label: "string bounds on a number attribute",
    schema: [
      {
        Name: "seats",
        AttributeDataType: "Number",
        StringAttributeConstraints: { MaxLength: "4" },
      },
    ],
    says: "only a String attribute takes",
  },
  {
    label: "a bound that is not a number",
    schema: [
      {
        Name: "userId",
        AttributeDataType: "String",
        StringAttributeConstraints: { MaxLength: "long" },
      },
    ],
    says: "which is not a number",
  },
  {
    label: "the same attribute twice",
    schema: [{ Name: "userId" }, { Name: "userId" }],
    says: "is declared twice",
  },
  {
    label: "a name carrying a character Cognito does not take",
    schema: [{ Name: "user id", AttributeDataType: "String" }],
    says: "a character Cognito does not take",
  },
  {
    label: "more attributes than Cognito takes in one request",
    schema: Array.from({ length: 51 }, (_unused, index) => ({
      Name: `field${String(index)}`,
    })),
    says: "Cognito takes between 1 and 50",
  },
  {
    label: "an empty schema",
    schema: [],
    says: "Cognito takes between 1 and 50",
  },
];

/**
 * The error a pool declaring a schema this simulation refuses gives back.
 */
async function refusedPool(refused: RefusedSchema): Promise<Error> {
  const cognito = new SimAws({
    defaultRegionName: "eu-west-2",
  }).cognitoIdentityProvider();

  return await assertThrowsErrorAsync(async () => {
    await cognito.createUserPool({
      input: { PoolName: "myapp-users", Schema: refused.schema },
    });
  }, refused.label);
}

describe("sim Cognito user pool schema validation", () => {
  it("refuses a schema real Cognito would refuse", async () => {
    // Given each declaration that could not have created a pool on real AWS.
    // When each is used to create one.
    const outcomes = await Promise.all(
      refusedSchemas.map(async (refused) => ({
        refused,
        error: await refusedPool(refused),
      })),
    );

    // Then each is refused, saying what was wrong with it.
    for (const { refused, error } of outcomes) {
      assertInstanceOf(error, SimCognitoInvalidParameterException);
      assertStringIncludes(error.message, refused.says, refused.label);
    }
  });
});
