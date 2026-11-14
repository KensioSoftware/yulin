import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimIamRoleName } from "../role/sim-iam-role.js";
import type { SimIamUsername } from "../user/sim-iam-user.js";

const trustPolicy = {
  Version: "2012-10-17",
  Statement: {
    Effect: "Allow",
    Principal: { Service: "lambda.amazonaws.com" },
    Action: "sts:AssumeRole",
  },
};

/**
 * Deploy one IAM Resource, and answer the simulation it went into.
 */
async function deploy(
  type: string,
  properties: SimCfnTemplateValueRecord,
): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.cloudFormation().deployTemplate({
    stackName: "iam-limits-stack",
    template: {
      Resources: { Identity: { Type: type, Properties: properties } },
    },
  });

  return simAws;
}

describe("IAM CloudFormation session limits", () => {
  it("sets a Role's MaxSessionDuration, from a number or its text", async () => {
    // Given Roles declaring their maximum as a number and as text
    const declare = async (
      value: number | string,
    ): Promise<number | undefined> => {
      const simAws = await deploy("AWS::IAM::Role", {
        RoleName: "Batch",
        AssumeRolePolicyDocument: trustPolicy,
        MaxSessionDuration: value,
      });

      return simAws.iam().roles.get("Batch" as SimIamRoleName)
        ?.maxSessionDuration;
    };

    // When each is deployed
    // Then both Roles carry the maximum
    assertIdentical(await declare(7200), 7200);
    assertIdentical(await declare("7200"), 7200);
  });

  it("refuses a MaxSessionDuration that is not a whole number", async () => {
    // Given a Role declaring a maximum that is not a number
    const error = await assertThrowsErrorAsync(async () => {
      // When it is deployed
      await deploy("AWS::IAM::Role", {
        RoleName: "Batch",
        AssumeRolePolicyDocument: trustPolicy,
        MaxSessionDuration: "two hours",
      });
    });

    // Then the Resource fails
    assertInstanceOf(error, TypeError);
  });

  it("sets a User's PermissionsBoundary", async () => {
    // Given a User declaring a boundary
    const boundaryArn = "arn:aws:iam::aws:policy/ReadOnlyAccess";

    // When it is deployed
    const simAws = await deploy("AWS::IAM::User", {
      UserName: "analyst",
      PermissionsBoundary: boundaryArn,
    });

    // Then the User carries the boundary
    assertIdentical(
      simAws.iam().users.get("analyst" as SimIamUsername)
        ?.permissionsBoundaryArn,
      boundaryArn,
    );
  });
});
