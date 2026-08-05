import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimIamManagedPolicy } from "../../policy/sim-iam-policy.js";
import type { SimArn } from "../../../aws/arn.js";

describe("IAM CloudFormation ManagedPolicy", () => {
  it("creates an IAM Managed Policy from AWS::IAM::ManagedPolicy", async () => {
    // Given a CloudFormation template declaring an IAM Managed Policy.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-managed-policy-stack",
      template: {
        Resources: {
          ReadOnlyPolicy: {
            Type: "AWS::IAM::ManagedPolicy",
            Properties: {
              ManagedPolicyName: "ReadOnlyAccess",
              Path: "/service-role/",
              Description: "Read-only access policy",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: "s3:GetObject",
                    Resource: "*",
                  },
                ],
              },
            },
          },
        },
      },
    });

    // Then the CloudFormation Resource is backed by a simulated Managed Policy.
    const resource = stack.getResource("ReadOnlyPolicy");

    assertNonNullable(resource);

    const policy = resource.simResource as SimIamManagedPolicy | undefined;

    assertNonNullable(policy);
    assertIdentical(policy.policyName, "ReadOnlyAccess");
    assertIdentical(policy.path, "/service-role/");
    assertIdentical(policy.description, "Read-only access policy");
    assertIdentical(simAws.iam().policies.get(policy.arn), policy);
  });

  it("defaults ManagedPolicyName to the logical ID and Path to the root", async () => {
    // Given a CloudFormation template with a Managed Policy that omits its name
    // and path.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-managed-policy-default-stack",
      template: {
        Resources: {
          DefaultNamedPolicy: {
            Type: "AWS::IAM::ManagedPolicy",
            Properties: {
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: "s3:ListBucket",
                    Resource: "*",
                  },
                ],
              },
            },
          },
        },
      },
    });

    // Then the Managed Policy uses the logical ID as its name and the root path.
    const resource = stack.getResource("DefaultNamedPolicy");

    assertNonNullable(resource);

    const policy = simAws.iam().policies.get(resource.refValue as SimArn);

    assertNonNullable(policy);
    assertIdentical(policy.policyName, "DefaultNamedPolicy");
    assertIdentical(policy.path, "/");
    assertUndefined(policy.description);
  });

  it("uses Parameters in Managed Policy properties", async () => {
    // Given a CloudFormation template whose Managed Policy name and description
    // are driven by Parameters.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation with parameter
    // values.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-managed-policy-parameter-stack",
      template: {
        Parameters: {
          PolicyName: {
            Type: "String",
            Default: "DefaultPolicyName",
          },
          PolicyDescription: {
            Type: "String",
            Default: "Default policy description",
          },
        },
        Resources: {
          ParameterPolicy: {
            Type: "AWS::IAM::ManagedPolicy",
            Properties: {
              ManagedPolicyName: {
                Ref: "PolicyName",
              },
              Description: {
                Ref: "PolicyDescription",
              },
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: "s3:GetObject",
                    Resource: "*",
                  },
                ],
              },
            },
          },
        },
      },
      parameters: {
        PolicyName: "ParameterPolicyName",
        PolicyDescription: "Parameter policy description",
      },
    });

    // Then the resolved Parameter values are used to create the Managed Policy.
    const resource = stack.getResource("ParameterPolicy");

    assertNonNullable(resource);

    const policy = simAws.iam().policies.get(resource.refValue as SimArn);

    assertNonNullable(policy);
    assertIdentical(policy.policyName, "ParameterPolicyName");
    assertIdentical(policy.description, "Parameter policy description");
  });

  it("uses the Managed Policy ARN for Ref and exposes it via Fn::GetAtt", async () => {
    // Given a CloudFormation template with a Managed Policy, a dependent
    // resource, and Outputs that exercise Ref and Fn::GetAtt resolution.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-managed-policy-ref-stack",
      template: {
        Resources: {
          OutputPolicy: {
            Type: "AWS::IAM::ManagedPolicy",
            Properties: {
              ManagedPolicyName: "OutputPolicy",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: "s3:GetObject",
                    Resource: "*",
                  },
                ],
              },
            },
          },
          WaitHandle: {
            Type: "AWS::CloudFormation::WaitConditionHandle",
            Properties: {
              PolicyArn: {
                Ref: "OutputPolicy",
              },
            },
          },
        },
        Outputs: {
          PolicyArn: {
            Value: {
              Ref: "OutputPolicy",
            },
          },
        },
      },
    });

    // Then Ref returns the Managed Policy ARN.
    const policyResource = stack.getResource("OutputPolicy");
    const waitHandleResource = stack.getResource("WaitHandle");

    assertNonNullable(policyResource);
    assertNonNullable(waitHandleResource);

    const policyArn = policyResource.refValue;

    assertTypeString(policyArn);
    assertIdentical(
      policyArn,
      `arn:aws:iam::${simAws.defaultAccountId}:policy/OutputPolicy`,
    );

    const resolvedWaitHandleProperties = waitHandleResource.resolvedProperties({
      resources: stack.resources,
    });

    assertIdentical(resolvedWaitHandleProperties["PolicyArn"], policyArn);
    assertIdentical(stack.outputs.get("PolicyArn")?.value, policyArn);
  });

  it("falls back to an ARN-derived value for unsupported Fn::GetAtt attributes", async () => {
    // Given a CloudFormation template that reads an attribute that
    // AWS::IAM::ManagedPolicy does not actually expose via Fn::GetAtt.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-managed-policy-unsupported-attribute-stack",
      template: {
        Resources: {
          AttributePolicy: {
            Type: "AWS::IAM::ManagedPolicy",
            Properties: {
              ManagedPolicyName: "AttributePolicy",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: "s3:GetObject",
                    Resource: "*",
                  },
                ],
              },
            },
          },
        },
        Outputs: {
          UnsupportedAttribute: {
            Value: {
              "Fn::GetAtt": ["AttributePolicy", "PolicyId"],
            },
          },
        },
      },
    });

    // Then the fallback attribute value is derived from the policy ARN.
    const resource = stack.getResource("AttributePolicy");

    assertNonNullable(resource);

    const policyArn = resource.refValue;

    assertTypeString(policyArn);
    assertIdentical(
      stack.outputs.get("UnsupportedAttribute")?.value,
      `${policyArn}.PolicyId`,
    );
  });

  it("supports duplicate Managed Policy names with distinct paths", async () => {
    // Given a CloudFormation template declaring two Managed Policies with the
    // same name but distinct paths.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    await simAws.cloudFormation().deployTemplate({
      stackName: "iam-managed-policy-duplicate-name-stack",
      template: {
        Resources: {
          FirstDuplicatePolicy: {
            Type: "AWS::IAM::ManagedPolicy",
            Properties: {
              ManagedPolicyName: "DuplicatePolicyName",
              Path: "/first/",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: "s3:GetObject",
                    Resource: "*",
                  },
                ],
              },
            },
          },
          SecondDuplicatePolicy: {
            Type: "AWS::IAM::ManagedPolicy",
            Properties: {
              ManagedPolicyName: "DuplicatePolicyName",
              Path: "/second/",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: "s3:GetObject",
                    Resource: "*",
                  },
                ],
              },
            },
          },
        },
      },
    });

    // Then both Managed Policies are created under their distinct ARNs.
    const listOutput = await simAws.iam().listPolicies({ input: {} });

    const duplicateNamed = listOutput.Policies.filter(
      (policy) => policy.PolicyName === "DuplicatePolicyName",
    );

    assertArrayLength(duplicateNamed, 2);
  });
});
