import {
  CreateUserPoolCommand,
  DescribeUserPoolCommand,
  UpdateUserPoolCommand,
  type SchemaAttributeType,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertFalse,
  assertInstanceOf,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";
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
    label: "more custom attributes than Cognito allows",
    schema: Array.from({ length: 51 }, (_unused, index) => ({
      Name: `field${String(index)}`,
    })),
    says: "more than the 50 custom attributes",
  },
];

function simCognito(): SimCognitoIdentityProvider {
  return new SimAws({
    defaultRegionName: "eu-west-2",
  }).cognitoIdentityProvider();
}

/**
 * Create a pool declaring the schema given, and give back its id.
 */
async function poolWith(
  cognito: SimCognitoIdentityProvider,
  schema: readonly SchemaAttributeType[],
): Promise<string> {
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users", Schema: [...schema] }),
  );

  assertNonNullable(created.UserPool?.Id);

  return created.UserPool.Id;
}

/**
 * The error a pool declaring a schema this simulation refuses gives back.
 */
async function refusedPool(refused: RefusedSchema): Promise<Error> {
  return await assertThrowsErrorAsync(async () => {
    await simCognito().createUserPool({
      input: { PoolName: "myapp-users", Schema: refused.schema },
    });
  }, refused.label);
}

/**
 * The schema attribute of that name a described pool reports.
 */
async function describedAttribute(
  cognito: SimCognitoIdentityProvider,
  userPoolId: string,
  name: string,
): Promise<SimCognitoSchemaAttributeType | undefined> {
  const described = await cognito.describeUserPool(
    new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
  );

  return described.UserPool?.SchemaAttributes?.find(
    (attribute) => attribute.Name === name,
  );
}

describe("sim Cognito user pool schema", () => {
  it("holds a custom attribute under the name Cognito gives it", async () => {
    // Given a pool declaring an attribute of its own.
    const cognito = simCognito();
    const userPoolId = await poolWith(cognito, [
      { Name: "userId", AttributeDataType: "String", Mutable: false },
    ]);

    // When the pool is described.
    const attribute = await describedAttribute(
      cognito,
      userPoolId,
      "custom:userId",
    );

    // Then it holds the attribute under its custom: name, as real Cognito
    // renames one.
    assertObjectEquals(attribute, {
      Name: "custom:userId",
      AttributeDataType: "String",
      DeveloperOnlyAttribute: false,
      Mutable: false,
      Required: false,
    });
    assertUndefined(await describedAttribute(cognito, userPoolId, "userId"));
  });

  it("reports the standard attributes a pool never declared", async () => {
    // Given a pool created without a Schema of its own.
    const cognito = simCognito();
    const userPoolId = await poolWith(cognito, []);

    // When the pool is described.
    const email = await describedAttribute(cognito, userPoolId, "email");
    const sub = await describedAttribute(cognito, userPoolId, "sub");

    // Then the standard schema is reported, as real Cognito reports it.
    assertObjectEquals(email, {
      Name: "email",
      AttributeDataType: "String",
      DeveloperOnlyAttribute: false,
      Mutable: true,
      Required: false,
      StringAttributeConstraints: { MinLength: "0", MaxLength: "2048" },
    });
    assertNonNullable(sub);
    assertFalse(sub.Mutable);
    assertTrue(sub.Required);
  });

  it("takes the bounds a declaration puts on an attribute", async () => {
    // Given a pool declaring a bounded number attribute.
    const cognito = simCognito();
    const userPoolId = await poolWith(cognito, [
      {
        Name: "seats",
        AttributeDataType: "Number",
        Mutable: true,
        NumberAttributeConstraints: { MinValue: "1", MaxValue: "500" },
      },
    ]);

    // When the pool is described.
    const attribute = await describedAttribute(
      cognito,
      userPoolId,
      "custom:seats",
    );

    // Then the bounds are reported as the declaration wrote them.
    assertNonNullable(attribute);
    assertObjectEquals(attribute.NumberAttributeConstraints, {
      MinValue: "1",
      MaxValue: "500",
    });
    assertTrue(attribute.Mutable);
  });

  it("redeclares a standard attribute rather than adding one", async () => {
    // Given a pool whose Schema names a standard attribute, which is what a
    // CDK pool asking for a required email emits.
    const cognito = simCognito();
    const userPoolId = await poolWith(cognito, [
      { Name: "email", Required: true },
    ]);

    // When the pool is described.
    const email = await describedAttribute(cognito, userPoolId, "email");

    // Then the standard attribute is the one that changed, and no custom:
    // attribute of that name was added.
    assertNonNullable(email);
    assertTrue(email.Required);
    assertFalse(email.Mutable);
    assertUndefined(
      await describedAttribute(cognito, userPoolId, "custom:email"),
    );
  });

  it("keeps a pool's schema over an update", async () => {
    // Given a pool with a custom attribute.
    const cognito = simCognito();
    const userPoolId = await poolWith(cognito, [{ Name: "userId" }]);

    // When the pool's settings are replaced.
    await cognito.updateUserPool(
      new UpdateUserPoolCommand({
        UserPoolId: userPoolId,
        DeletionProtection: "INACTIVE",
      }),
    );

    // Then the attributes survive, because real Cognito has no way to change
    // them in that call.
    assertNonNullable(
      await describedAttribute(cognito, userPoolId, "custom:userId"),
    );
  });

  it("refuses an update declaring a schema", async () => {
    // Given a pool.
    const cognito = simCognito();
    const userPoolId = await poolWith(cognito, []);

    // When an update declares an attribute.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.updateUserPool({
        input: { UserPoolId: userPoolId, Schema: [{ Name: "userId" }] },
      });
    });

    // Then it is refused: UpdateUserPool has no such input on real Cognito.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "AddCustomAttributes");
  });

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
