import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamMalformedPolicyDocument } from "../../error/sim-iam.error.js";
import { SimIamLimitExceeded } from "../../error/sim-iam.error.js";
import { maxSimIamInlinePolicyCharacters } from "../../validate/size/sim-iam-policy-document-size.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimIamCloudFormationResourceFactory } from "../sim-cfn-iam-resource-factory.js";
import { SimCfnIamPolicyCreator } from "./sim-cfn-iam-policy-creator.js";

const assumeRolePolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: {
        Service: "athena.amazonaws.com",
      },
      Action: "sts:AssumeRole",
    },
  ],
};

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

  it("rejects a Policy naming no principal", async () => {
    // Given Policy properties naming neither a Role nor a User, which leaves
    // the policy with nothing to attach to.
    // When creation is attempted, then each rejects naming both properties.
    await assertRejectsPolicy(
      { PolicyName: "BadPolicy", PolicyDocument: validPolicyDocument },
      "Roles or Users must name at least one principal",
    );
    await assertRejectsPolicy(
      {
        PolicyName: "BadPolicy",
        PolicyDocument: validPolicyDocument,
        Roles: [],
        Users: [],
      },
      "Roles or Users must name at least one principal",
    );
  });

  it("rejects malformed Roles", async () => {
    // Given Policy properties with malformed Roles.
    // When creation is attempted, then each rejects naming the property.
    await assertRejectsPolicy(
      {
        PolicyName: "BadPolicy",
        PolicyDocument: validPolicyDocument,
        Roles: "ReaderRole",
      },
      "Roles must be an array",
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

  it("rejects malformed Users", async () => {
    // Given Policy properties with malformed Users.
    // When creation is attempted, then each rejects naming the property.
    await assertRejectsPolicy(
      {
        PolicyName: "BadPolicy",
        PolicyDocument: validPolicyDocument,
        Users: "ReaderUser",
      },
      "Users must be an array",
    );
    await assertRejectsPolicy(
      {
        PolicyName: "BadPolicy",
        PolicyDocument: validPolicyDocument,
        Users: [42],
      },
      "Users entries must be strings",
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

  it("rejects an unsimulated Groups principal", async () => {
    // Given Policy properties naming Groups, which sim IAM does not simulate
    // as a CloudFormation policy principal.
    // When creation is attempted, then it rejects rather than silently
    // dropping the grant.
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

  it("rejects a PolicyDocument holding an unresolved intrinsic", async () => {
    // Given a template whose Policy statement names a Resource that the
    // template never declares, which leaves the Fn::GetAtt unresolved and
    // stored in the document as written.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "dangling-intrinsic-stack",
        template: {
          Resources: {
            QueryRole: {
              Type: "AWS::IAM::Role",
              Properties: {
                RoleName: "QueryRole",
                AssumeRolePolicyDocument: assumeRolePolicyDocument,
              },
            },
            QueryPolicy: {
              Type: "AWS::IAM::Policy",
              Properties: {
                PolicyName: "RunQueries",
                Roles: [{ Ref: "QueryRole" }],
                PolicyDocument: {
                  Version: "2012-10-17",
                  Statement: [
                    {
                      Effect: "Allow",
                      Action: "athena:StartQueryExecution",
                      Resource: { "Fn::GetAtt": ["DoesNotExist", "Arn"] },
                    },
                  ],
                },
              },
            },
          },
        },
      }),
    );

    // Then the deployment fails on the policy holding it, and the message
    // names the Role, the policy and the statement.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource QueryPolicy creation failed: Role " +
        '"QueryRole" policy "RunQueries" statement 1: Resource must be a ' +
        "string or an array of strings, but holds " +
        '{"Fn::GetAtt":["DoesNotExist","Arn"]}',
    );
  });

  it("fails the Resource when the PolicyDocument is over IAM's limit", async () => {
    // Given a CloudFormation template whose inline policy document is past
    // the 10,240 characters IAM takes.
    const simAws = new SimAws();
    const oversizedDocument = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "s3:GetObject",
          Resource: `arn:aws:s3:::reports-bucket/${"x".repeat(
            maxSimIamInlinePolicyCharacters,
          )}`,
        },
      ],
    };

    // When / then deploying the template throws.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "oversized-inline-policy-stack",
        template: {
          Resources: {
            QueryRole: {
              Type: "AWS::IAM::Role",
              Properties: {
                RoleName: "QueryRole",
                AssumeRolePolicyDocument: assumeRolePolicyDocument,
              },
            },
            QueryPolicy: {
              Type: "AWS::IAM::Policy",
              Properties: {
                PolicyName: "RunQueries",
                Roles: [{ Ref: "QueryRole" }],
                PolicyDocument: oversizedDocument,
              },
            },
          },
        },
      }),
    );

    // Then the Resource fails on the document, naming the Role it was going
    // onto.
    assertInstanceOf(error, SimIamLimitExceeded);
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource QueryPolicy creation failed: " +
        "Maximum policy size of 10240 bytes exceeded for role QueryRole",
    );
  });
});
