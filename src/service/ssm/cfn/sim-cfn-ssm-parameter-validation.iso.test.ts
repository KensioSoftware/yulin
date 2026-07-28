import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimSsmCfnResourceFactory } from "./sim-cfn-ssm-resource-factory.js";

const accountIdOneOnes = "111111111111" as SimAwsAccountId;

function parameterResource(
  properties: SimCfnTemplateValueRecord,
  logicalId = "BadParameter",
): SimCfnResource {
  return new SimCfnResource({
    accountRegionScope: {
      accountId: accountIdOneOnes,
      regionName: "eu-west-2",
    },
    logicalId,
    template: { Type: "AWS::SSM::Parameter", Properties: properties },
  });
}

/**
 * Run work that is expected to reject, returning whatever it rejected with.
 */
async function rejection(work: () => Promise<unknown>): Promise<Error> {
  try {
    await work();
  } catch (error) {
    assertInstanceOf(error, Error);

    return error;
  }

  throw new Error("Expected Parameter creation to reject");
}

/**
 * Create a parameter straight through the Resource factory, returning
 * whatever it rejects with. Keeps the property rules under test without a
 * whole stack.
 */
async function createParameterResource(
  properties: SimCfnTemplateValueRecord,
): Promise<Error> {
  const simAws = new SimAws();
  const factory = new SimSsmCfnResourceFactory({ ssm: simAws.ssm() });

  return await rejection(async () => {
    return await factory.create("Parameter", parameterResource(properties), {
      simAws,
      resources: new Map(),
    });
  });
}

describe("SSM CloudFormation Parameter validation", () => {
  it("refuses a SecureString parameter", async () => {
    // Given a template asking for a SecureString, which real CloudFormation
    // refuses for this Resource type.
    // When the Resource is created, then it is refused.
    const error = await createParameterResource({
      Name: "/myapp/prod/db-password",
      Type: "SecureString",
      Value: "hunter2",
    });

    assertStringIncludes(
      error.message,
      "Invalid AWS::SSM::Parameter Resource BadParameter: Type SecureString " +
        "is not supported.",
    );
  });

  it("refuses a parameter with no Type or no Value", async () => {
    // Given templates leaving out a property CloudFormation requires.
    // When each Resource is created, then each is refused by name.
    const noType = await createParameterResource({
      Name: "/myapp/prod/db-host",
      Value: "db.internal",
    });
    assertIdentical(
      noType.message,
      "Invalid AWS::SSM::Parameter Resource BadParameter: Type is required",
    );

    const noValue = await createParameterResource({
      Name: "/myapp/prod/db-host",
      Type: "String",
    });
    assertIdentical(
      noValue.message,
      "Invalid AWS::SSM::Parameter Resource BadParameter: Value is required",
    );
  });

  it("refuses malformed property values", async () => {
    // Given properties of the wrong shape.
    // When each Resource is created, then each is refused by name.
    const name = await createParameterResource({
      Name: 42,
      Type: "String",
      Value: "db.internal",
    });
    assertIdentical(
      name.message,
      "Invalid AWS::SSM::Parameter Resource BadParameter: Name must be a " +
        "string",
    );

    const tags = await createParameterResource({
      Name: "/myapp/prod/db-host",
      Type: "String",
      Value: "db.internal",
      Tags: ["component"],
    });
    assertIdentical(
      tags.message,
      "Invalid AWS::SSM::Parameter Resource BadParameter: Tags must be an " +
        "object",
    );

    const tagValue = await createParameterResource({
      Name: "/myapp/prod/db-host",
      Type: "String",
      Value: "db.internal",
      Tags: { component: 42 },
    });
    assertIdentical(
      tagValue.message,
      "Invalid AWS::SSM::Parameter Resource BadParameter: Tags.component " +
        "must be a string",
    );
  });

  it("passes the options Parameter Store refuses through to PutParameter", async () => {
    // Given templates declaring properties this simulation does not model.
    // When each Resource is created, then PutParameter refuses it, so the
    // refusal reads the same whether a template or an SDK caller asked.
    const tier = await createParameterResource({
      Name: "/myapp/prod/db-host",
      Type: "String",
      Value: "db.internal",
      Tier: "Advanced",
    });
    assertStringIncludes(
      tier.message,
      "Parameter Tier 'Advanced' is not simulated",
    );

    const allowedPattern = await createParameterResource({
      Name: "/myapp/prod/db-host",
      Type: "String",
      Value: "db.internal",
      AllowedPattern: "^[a-z.]+$",
    });
    assertStringIncludes(
      allowedPattern.message,
      "PutParameter AllowedPattern is not simulated",
    );

    const parameterTags = await createParameterResource({
      Name: "/myapp/prod/db-host",
      Type: "String",
      Value: "db.internal",
      Tags: { component: "database" },
    });
    assertStringIncludes(
      parameterTags.message,
      "PutParameter Tags is not simulated",
    );
  });

  it("refuses a name another stack already used", async () => {
    // Given a parameter a stack already deployed. Sim CloudFormation has no
    // UpdateStack, so every deployment is a create, and real CloudFormation
    // fails a create naming a parameter that exists.
    const simAws = new SimAws();
    const factory = new SimSsmCfnResourceFactory({ ssm: simAws.ssm() });
    const properties = {
      Name: "/myapp/prod/db-host",
      Type: "String",
      Value: "db.internal",
    };
    await factory.create("Parameter", parameterResource(properties), {
      simAws,
      resources: new Map(),
    });

    // When a second stack claims the same name, then it is refused.
    const error = await rejection(async () => {
      return await factory.create("Parameter", parameterResource(properties), {
        simAws,
        resources: new Map(),
      });
    });

    assertStringIncludes(
      error.message,
      "The parameter '/myapp/prod/db-host' already exists",
    );
  });

  it("refuses an attribute AWS::SSM::Parameter does not have", async () => {
    // Given a deployed parameter.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "config-stack",
      template: {
        Resources: {
          DbHost: {
            Type: "AWS::SSM::Parameter",
            Properties: {
              Name: "/myapp/prod/db-host",
              Type: "String",
              Value: "db.internal",
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    const resource = stack.getResource("DbHost");
    assertNonNullable(resource);

    // When an attribute the Resource type does not have is read, then it is
    // refused rather than resolving to nothing.
    const error = assertThrowsError(() => {
      resource.attributeValue("Arn");
    });
    assertIdentical(
      error.message,
      "Unsupported AWS::SSM::Parameter attribute Arn",
    );
  });

  it("records the rest of Systems Manager as skipped", async () => {
    // Given a template declaring a Systems Manager Resource type that is not
    // Parameter Store, which is all this simulation models.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "ops-stack",
      template: {
        Resources: {
          RunbookDocument: {
            Type: "AWS::SSM::Document",
            Properties: { Content: { schemaVersion: "2.2" } },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the stack completes with that Resource skipped rather than failing
    // the deployment.
    assertArrayLength(stack.skippedResources, 1);
    const skipped = stack.skippedResources[0];
    assertNonNullable(skipped);
    assertTrue(skipped.skipped);
    assertIdentical(
      skipped.skippedReason,
      "Unsupported sim SSM CloudFormation Resource Document",
    );
  });
});
