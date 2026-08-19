import {
  assertIdentical,
  assertNonNullable,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimIamRole } from "../../role/sim-iam-role.js";

const assumeRolePolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: {
        Service: "lambda.amazonaws.com",
      },
      Action: "sts:AssumeRole",
    },
  ],
};

describe("IAM CloudFormation Role", () => {
  it("creates an IAM Role from AWS::IAM::Role", async () => {
    // Given a CloudFormation template declaring an IAM Role.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-role-stack",
      template: {
        Resources: {
          ServiceRole: {
            Type: "AWS::IAM::Role",
            Properties: {
              RoleName: "LambdaExecutionRole",
              Path: "/service-role/",
              Description: "Role assumed by the Lambda service",
              AssumeRolePolicyDocument: assumeRolePolicyDocument,
            },
          },
        },
      },
    });

    // Then the CloudFormation Resource is backed by a simulated Role.
    const resource = stack.getResource("ServiceRole");

    assertNonNullable(resource);

    const role = resource.simResource as SimIamRole | undefined;

    assertNonNullable(role);
    assertIdentical(role.roleName, "LambdaExecutionRole");
    assertIdentical(role.path, "/service-role/");
    assertIdentical(role.description, "Role assumed by the Lambda service");
    assertIdentical(simAws.iam().roles.get(role.roleName), role);

    // And the Role is retrievable through the IAM GetRole API.
    const roleOut = await simAws.iam().getRole({
      input: { RoleName: "LambdaExecutionRole" },
    });

    assertIdentical(roleOut.Role.RoleName, "LambdaExecutionRole");
    assertIdentical(roleOut.Role.Arn, role.arn);
  });

  it("defaults RoleName to the logical ID and Path to the root", async () => {
    // Given a CloudFormation template with a Role that omits its name and path.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-role-default-stack",
      template: {
        Resources: {
          DefaultNamedRole: {
            Type: "AWS::IAM::Role",
            Properties: {
              AssumeRolePolicyDocument: assumeRolePolicyDocument,
            },
          },
        },
      },
    });

    // Then the Role uses the logical ID as its name and the root path.
    const resource = stack.getResource("DefaultNamedRole");

    assertNonNullable(resource);

    const role = simAws.iam().roles.get(resource.refValue as never);

    assertNonNullable(role);
    assertIdentical(role.roleName, "DefaultNamedRole");
    assertIdentical(role.path, "/");
    assertUndefined(role.description);
  });

  it("uses Parameters in Role properties", async () => {
    // Given a CloudFormation template whose Role name and description are driven
    // by Parameters.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation with parameter
    // values.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-role-parameter-stack",
      template: {
        Parameters: {
          RoleName: {
            Type: "String",
            Default: "DefaultRoleName",
          },
          RoleDescription: {
            Type: "String",
            Default: "Default role description",
          },
        },
        Resources: {
          ParameterRole: {
            Type: "AWS::IAM::Role",
            Properties: {
              RoleName: {
                Ref: "RoleName",
              },
              Description: {
                Ref: "RoleDescription",
              },
              AssumeRolePolicyDocument: assumeRolePolicyDocument,
            },
          },
        },
      },
      parameters: {
        RoleName: "ParameterRoleName",
        RoleDescription: "Parameter role description",
      },
    });

    // Then the resolved Parameter values are used to create the Role.
    const resource = stack.getResource("ParameterRole");

    assertNonNullable(resource);

    const role = simAws.iam().roles.get(resource.refValue as never);

    assertNonNullable(role);
    assertIdentical(role.roleName, "ParameterRoleName");
    assertIdentical(role.description, "Parameter role description");
  });

  it("stores inline Policies declared on the Role", async () => {
    // Given a CloudFormation template with a Role carrying inline Policies.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-role-inline-policy-stack",
      template: {
        Resources: {
          InlinePolicyRole: {
            Type: "AWS::IAM::Role",
            Properties: {
              RoleName: "InlinePolicyRole",
              AssumeRolePolicyDocument: assumeRolePolicyDocument,
              Policies: [
                {
                  PolicyName: "ReadReports",
                  PolicyDocument: {
                    Version: "2012-10-17",
                    Statement: [
                      {
                        Effect: "Allow",
                        Action: "s3:GetObject",
                        Resource: "arn:aws:s3:::reports-bucket/*",
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    });

    // Then the inline policy is stored on the created Role.
    const resource = stack.getResource("InlinePolicyRole");

    assertNonNullable(resource);

    const role = resource.simResource as SimIamRole | undefined;

    assertNonNullable(role);

    const inlinePolicy = role.inlinePolicies.get("ReadReports");

    assertTypeString(inlinePolicy);
    assertIdentical(
      inlinePolicy,
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::reports-bucket/*",
          },
        ],
      }),
    );
  });

  it("uses the Role name for Ref and exposes Arn and RoleId via Fn::GetAtt", async () => {
    // Given a CloudFormation template with a Role, a dependent resource, and
    // Outputs that exercise Ref and Fn::GetAtt resolution.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-role-ref-stack",
      template: {
        Resources: {
          OutputRole: {
            Type: "AWS::IAM::Role",
            Properties: {
              RoleName: "OutputRole",
              AssumeRolePolicyDocument: assumeRolePolicyDocument,
            },
          },
          WaitHandle: {
            Type: "AWS::CloudFormation::WaitConditionHandle",
            Properties: {
              RoleName: {
                Ref: "OutputRole",
              },
              RoleArn: {
                "Fn::GetAtt": ["OutputRole", "Arn"],
              },
              RoleId: {
                "Fn::GetAtt": ["OutputRole", "RoleId"],
              },
            },
          },
        },
        Outputs: {
          RoleName: {
            Value: {
              Ref: "OutputRole",
            },
          },
          RoleArn: {
            Value: {
              "Fn::GetAtt": ["OutputRole", "Arn"],
            },
          },
          RoleId: {
            Value: {
              "Fn::GetAtt": ["OutputRole", "RoleId"],
            },
          },
        },
      },
    });

    // Then Ref returns the Role name and Fn::GetAtt returns Arn and RoleId.
    const roleResource = stack.getResource("OutputRole");
    const waitHandleResource = stack.getResource("WaitHandle");

    assertNonNullable(roleResource);
    assertNonNullable(waitHandleResource);

    const role = roleResource.simResource as SimIamRole;

    assertIdentical(roleResource.refValue, "OutputRole");

    const resolvedWaitHandleProperties =
      await waitHandleResource.resolvedProperties({
        resources: stack.resources,
      });

    assertIdentical(resolvedWaitHandleProperties["RoleName"], "OutputRole");
    assertIdentical(resolvedWaitHandleProperties["RoleArn"], role.arn);
    assertIdentical(resolvedWaitHandleProperties["RoleId"], role.roleId);

    assertIdentical(stack.outputs.get("RoleName")?.value, "OutputRole");
    assertIdentical(stack.outputs.get("RoleArn")?.value, role.arn);
    assertIdentical(stack.outputs.get("RoleId")?.value, role.roleId);
  });

  it("falls back to an ARN-derived value for unsupported Fn::GetAtt attributes", async () => {
    // Given a CloudFormation template that reads an attribute that
    // AWS::IAM::Role does not expose via Fn::GetAtt.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-role-unsupported-attribute-stack",
      template: {
        Resources: {
          AttributeRole: {
            Type: "AWS::IAM::Role",
            Properties: {
              RoleName: "AttributeRole",
              AssumeRolePolicyDocument: assumeRolePolicyDocument,
            },
          },
        },
        Outputs: {
          UnsupportedAttribute: {
            Value: {
              "Fn::GetAtt": ["AttributeRole", "Path"],
            },
          },
        },
      },
    });

    // Then the fallback attribute value is derived from the role ARN.
    const resource = stack.getResource("AttributeRole");

    assertNonNullable(resource);

    const role = resource.simResource as SimIamRole;

    assertIdentical(
      stack.outputs.get("UnsupportedAttribute")?.value,
      `${role.arn}.Path`,
    );
  });
});
