import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimIamCloudFormationResourceFactory } from "../sim-cfn-iam-resource-factory.js";
import { SimCfnIamPolicyCreator } from "./sim-cfn-iam-policy-creator.js";

const validPolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Action: "s3:GetObject",
      Resource: "arn:aws:s3:::data-bucket/*",
    },
  ],
};

async function policyCreationError(
  properties: SimCfnTemplateValueRecord,
): Promise<Error> {
  const simAws = new SimAws();
  const creator = new SimCfnIamPolicyCreator({ iam: simAws.iam() });
  const resource = new SimCfnResource({
    accountRegionScope: {
      accountId: "111111111111" as SimAwsAccountId,
      regionName: "eu-west-2",
    },
    logicalId: "BadPolicy",
    template: {
      Type: "AWS::IAM::Policy",
      Properties: properties,
    },
  });

  return await assertThrowsErrorAsync(async () =>
    creator.create(resource, properties),
  );
}

async function assertRejectsPolicy(
  properties: SimCfnTemplateValueRecord,
  expectedMessage: string,
): Promise<void> {
  const error = await policyCreationError(properties);

  assertInstanceOf(error, TypeError);
  assertIdentical(
    error.message,
    `Invalid AWS::IAM::Policy BadPolicy: ${expectedMessage}`,
  );
}

describe("IAM CloudFormation Policy validation", () => {
  it("rejects a missing or non-string PolicyName", async () => {
    // Given Policy properties with a missing or malformed PolicyName.
    // When creation is attempted, then each rejects naming the property and
    // the logical ID.
    await assertRejectsPolicy(
      { PolicyDocument: validPolicyDocument, Roles: ["ReaderRole"] },
      "PolicyName must be a string",
    );
    await assertRejectsPolicy(
      {
        PolicyName: 42,
        PolicyDocument: validPolicyDocument,
        Roles: ["ReaderRole"],
      },
      "PolicyName must be a string",
    );
  });

  it("rejects a missing or malformed PolicyDocument", async () => {
    // Given Policy properties with a missing or malformed PolicyDocument.
    // When creation is attempted, then each rejects naming the property.
    await assertRejectsPolicy(
      { PolicyName: "BadPolicy", Roles: ["ReaderRole"] },
      "PolicyDocument must be an object",
    );
    await assertRejectsPolicy(
      { PolicyName: "BadPolicy", PolicyDocument: "{}", Roles: ["ReaderRole"] },
      "PolicyDocument must be an object",
    );
    await assertRejectsPolicy(
      { PolicyName: "BadPolicy", PolicyDocument: [], Roles: ["ReaderRole"] },
      "PolicyDocument must be an object",
    );
  });

  it("rejects missing, empty, or malformed Roles", async () => {
    // Given Policy properties with missing or malformed Roles.
    // When creation is attempted, then each rejects naming the property.
    await assertRejectsPolicy(
      { PolicyName: "BadPolicy", PolicyDocument: validPolicyDocument },
      "Roles must be a non-empty array",
    );
    await assertRejectsPolicy(
      {
        PolicyName: "BadPolicy",
        PolicyDocument: validPolicyDocument,
        Roles: [],
      },
      "Roles must be a non-empty array",
    );
    await assertRejectsPolicy(
      {
        PolicyName: "BadPolicy",
        PolicyDocument: validPolicyDocument,
        Roles: [42],
      },
      "Roles entries must be strings",
    );
  });

  it("rejects unsupported IAM resource types", async () => {
    // Given an IAM CloudFormation Resource factory and an unsupported
    // Resource type.
    const simAws = new SimAws();
    const factory = new SimIamCloudFormationResourceFactory(simAws.iam());
    const resource = new SimCfnResource({
      accountRegionScope: {
        accountId: "111111111111" as SimAwsAccountId,
        regionName: "eu-west-2",
      },
      logicalId: "ExampleGroup",
      template: {
        Type: "AWS::IAM::Group",
      },
    });

    // When creation is attempted, then it rejects with an unsupported
    // Resource type error naming the type for diagnosis.
    const error = await assertThrowsErrorAsync(async () =>
      factory.create("Group", resource, { simAws, resources: new Map() }),
    );

    assertIdentical(
      error.message,
      "Unsupported sim IAM CloudFormation Resource Group",
    );
  });

  it("rejects unsimulated Users and Groups principals", async () => {
    // Given Policy properties naming Users or Groups, which sim IAM does not
    // simulate as CloudFormation policy principals.
    // When creation is attempted, then each rejects rather than silently
    // dropping the grant.
    await assertRejectsPolicy(
      {
        PolicyName: "BadPolicy",
        PolicyDocument: validPolicyDocument,
        Roles: ["ReaderRole"],
        Users: ["SomeUser"],
      },
      "Users are not simulated",
    );
    await assertRejectsPolicy(
      {
        PolicyName: "BadPolicy",
        PolicyDocument: validPolicyDocument,
        Roles: ["ReaderRole"],
        Groups: ["SomeGroup"],
      },
      "Groups are not simulated",
    );
  });
});
