import {
  assertArrayLength,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamNoSuchEntity } from "../../error/sim-iam.error.js";

const readObjectsDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Action: "s3:GetObject",
      Resource: "*",
    },
  ],
};

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

  it("rejects a Users entry", async () => {
    // Given a CloudFormation template attaching a Managed Policy to a User.
    const simAws = new SimAws();

    // When / then deploying the template throws.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "iam-managed-policy-users-stack",
        template: {
          Resources: {
            UserPolicy: {
              Type: "AWS::IAM::ManagedPolicy",
              Properties: {
                ManagedPolicyName: "UserPolicy",
                Users: ["reporting-user"],
                PolicyDocument: readObjectsDocument,
              },
            },
          },
        },
      });
    });

    assertInstanceOf(error, TypeError);
  });

  it("rejects a Groups entry", async () => {
    // Given a CloudFormation template attaching a Managed Policy to a Group.
    const simAws = new SimAws();

    // When / then deploying the template throws.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "iam-managed-policy-groups-stack",
        template: {
          Resources: {
            GroupPolicy: {
              Type: "AWS::IAM::ManagedPolicy",
              Properties: {
                ManagedPolicyName: "GroupPolicy",
                Groups: ["reporting-group"],
                PolicyDocument: readObjectsDocument,
              },
            },
          },
        },
      });
    });

    assertInstanceOf(error, TypeError);
  });

  it("rejects a non-array Roles", async () => {
    // Given a CloudFormation template whose Roles is a bare string.
    const simAws = new SimAws();

    // When / then deploying the template throws.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "iam-managed-policy-roles-scalar-stack",
        template: {
          Resources: {
            ScalarRolesPolicy: {
              Type: "AWS::IAM::ManagedPolicy",
              Properties: {
                ManagedPolicyName: "ScalarRolesPolicy",
                Roles: "reporting-role",
                PolicyDocument: readObjectsDocument,
              },
            },
          },
        },
      });
    });

    assertInstanceOf(error, TypeError);
  });

  it("rejects a non-string Roles entry", async () => {
    // Given a CloudFormation template whose Roles entry is a number.
    const simAws = new SimAws();

    // When / then deploying the template throws.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "iam-managed-policy-roles-entry-stack",
        template: {
          Resources: {
            NumericRolesPolicy: {
              Type: "AWS::IAM::ManagedPolicy",
              Properties: {
                ManagedPolicyName: "NumericRolesPolicy",
                Roles: [42],
                PolicyDocument: readObjectsDocument,
              },
            },
          },
        },
      });
    });

    assertInstanceOf(error, TypeError);
  });

  it("rejects a Roles entry naming no simulated Role", async () => {
    // Given a CloudFormation template naming a Role that was never created.
    const simAws = new SimAws();

    // When / then deploying the template throws.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "iam-managed-policy-missing-role-stack",
        template: {
          Resources: {
            MissingRolePolicy: {
              Type: "AWS::IAM::ManagedPolicy",
              Properties: {
                ManagedPolicyName: "MissingRolePolicy",
                Roles: ["absent-role"],
                PolicyDocument: readObjectsDocument,
              },
            },
          },
        },
      });
    });

    assertInstanceOf(error, SimIamNoSuchEntity);
  });

  it("leaves no Managed Policy behind when a Roles entry fails the Resource", async () => {
    // Given a CloudFormation template naming a Role that was never created.
    const simAws = new SimAws();

    // When deploying the template throws.
    await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "iam-managed-policy-no-orphan-stack",
        template: {
          Resources: {
            OrphanCheckPolicy: {
              Type: "AWS::IAM::ManagedPolicy",
              Properties: {
                ManagedPolicyName: "OrphanCheckPolicy",
                Roles: ["absent-role"],
                PolicyDocument: readObjectsDocument,
              },
            },
          },
        },
      });
    });

    // Then the Managed Policy the Resource would have created is not there.
    const listOutput = await simAws.iam().listPolicies({ input: {} });

    assertArrayLength(
      listOutput.Policies.filter(
        (policy) => policy.PolicyName === "OrphanCheckPolicy",
      ),
      0,
    );
  });
});
