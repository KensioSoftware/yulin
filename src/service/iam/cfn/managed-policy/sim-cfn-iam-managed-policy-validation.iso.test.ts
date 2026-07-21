import { assertInstanceOf, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";

describe("IAM CloudFormation ManagedPolicy validation", () => {
  it("requires a PolicyDocument", async () => {
    // Given a CloudFormation template with a Managed Policy that omits its
    // required PolicyDocument.
    const simAws = new SimAws();

    // When / then deploying the template throws.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "iam-managed-policy-missing-document-stack",
        template: {
          Resources: {
            InvalidPolicy: {
              Type: "AWS::IAM::ManagedPolicy",
              Properties: {
                ManagedPolicyName: "InvalidPolicy",
              },
            },
          },
        },
      });
    });

    assertInstanceOf(error, TypeError);
  });

  it("rejects a non-string ManagedPolicyName", async () => {
    // Given a CloudFormation template with a non-string ManagedPolicyName.
    const simAws = new SimAws();

    // When / then deploying the template throws.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "iam-managed-policy-invalid-name-stack",
        template: {
          Resources: {
            InvalidPolicy: {
              Type: "AWS::IAM::ManagedPolicy",
              Properties: {
                ManagedPolicyName: 42,
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
    });

    assertInstanceOf(error, TypeError);
  });

  it("rejects a non-string Path", async () => {
    // Given a CloudFormation template with a non-string Path.
    const simAws = new SimAws();

    // When / then deploying the template throws.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "iam-managed-policy-invalid-path-stack",
        template: {
          Resources: {
            InvalidPolicy: {
              Type: "AWS::IAM::ManagedPolicy",
              Properties: {
                ManagedPolicyName: "InvalidPolicy",
                Path: 42,
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
    });

    assertInstanceOf(error, TypeError);
  });

  it("rejects a non-string Description", async () => {
    // Given a CloudFormation template with a non-string Description.
    const simAws = new SimAws();

    // When / then deploying the template throws.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "iam-managed-policy-invalid-description-stack",
        template: {
          Resources: {
            InvalidPolicy: {
              Type: "AWS::IAM::ManagedPolicy",
              Properties: {
                ManagedPolicyName: "InvalidPolicy",
                Description: 42,
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
    });

    assertInstanceOf(error, TypeError);
  });
});
