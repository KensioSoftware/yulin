import {
  assertFalse,
  assertIdentical,
  assertStringLength,
  assertStringMatches,
  assertStringStartsWith,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCognitoName } from "../user-pool/sim-cognito-name.js";
import { SimCfnCognitoGeneratedName } from "./sim-cfn-cognito-generated-name.js";

describe("SimCfnCognitoGeneratedName", () => {
  it("names a resource after the stack and the logical ID", () => {
    // Given a Resource in a stack whose template named neither the pool nor
    // the client.
    const pool = new SimCfnCognitoGeneratedName({
      stackName: "app-stack",
      logicalId: "AppPool",
    });
    const client = new SimCfnCognitoGeneratedName({
      stackName: "app-stack",
      logicalId: "AppPoolClient",
    });

    // When each generated name is read, then it carries both parts and a
    // tail, as a real CloudFormation generated name does.
    assertStringMatches(pool.value, /^app-stack-AppPool-[\da-f]{12}$/);
    assertStringMatches(client.value, /^app-stack-AppPoolClient-[\da-f]{12}$/);
  });

  it("falls back to the logical ID with no stack name", () => {
    // Given a Resource created outside a stack, which has no stack name to
    // derive a name from.
    const noStack = new SimCfnCognitoGeneratedName({
      stackName: undefined,
      logicalId: "AppPool",
    });
    const emptyStackName = new SimCfnCognitoGeneratedName({
      stackName: "",
      logicalId: "AppPool",
    });

    // When the generated name is read, then it is the logical ID and a tail
    // rather than a name with an empty part in it.
    assertStringMatches(noStack.value, /^AppPool-[\da-f]{12}$/);
    assertIdentical(emptyStackName.value, noStack.value);
  });

  it("trims a generated name to the 128 characters Cognito allows", () => {
    // Given a stack name and logical ID too long together for a Cognito name.
    const stackName = "a".repeat(100);
    const logicalId = "AppPoolWithARatherLongLogicalIdIndeed";
    const name = new SimCfnCognitoGeneratedName({ stackName, logicalId });

    // When the generated name is read, then it is trimmed to fit, and the
    // logical ID keeps the characters the stack name does not need.
    assertStringLength(name.value, 128);
    assertStringStartsWith(name.value, `${"a".repeat(77)}-${logicalId}-`);

    // And the same template generates the same name again, rather than a new
    // one each deployment.
    assertIdentical(
      name.value,
      new SimCfnCognitoGeneratedName({ stackName, logicalId }).value,
    );
  });

  it("keeps two trimmed names apart where only the trimmed-off part differs", () => {
    // Given two logical IDs that are the same up to the point a generated name
    // is trimmed at. CDK puts its disambiguating hash at the end of a logical
    // ID, which is the part trimming takes off.
    const stackName = "a".repeat(90);
    const sharedPrefix = "AppPool".repeat(6);
    const first = new SimCfnCognitoGeneratedName({
      stackName,
      logicalId: `${sharedPrefix}D3F588B8`,
    });
    const second = new SimCfnCognitoGeneratedName({
      stackName,
      logicalId: `${sharedPrefix}8A3E5EB7`,
    });

    // When both names are read, then they are different names, so the two
    // resources do not ask for one name.
    assertStringLength(first.value, 128);
    assertStringLength(second.value, 128);
    assertFalse(first.value === second.value);
  });

  it("generates a name the Cognito name rules accept", () => {
    // Given a trimmed name, whose hashed tail is the part most likely to
    // carry a character a Cognito name does not allow.
    const generated = new SimCfnCognitoGeneratedName({
      stackName: "a".repeat(100),
      logicalId: "AppPoolWithARatherLongLogicalIdIndeed",
    });

    // When it is put through the rules both creation commands apply.
    const name = new SimCognitoName({
      field: "PoolName",
      value: generated.value,
    });

    // Then it is accepted, rather than a template without a name failing on
    // the one this generated for it.
    assertIdentical(name.value, generated.value);
  });
});
