import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringStartsWith,
  assertTypeString,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimIamUser } from "../../user/sim-iam-user.js";
import {
  deployedResourceObject,
  deployedStackObject,
} from "../../../cloudformation/stack/sim-cfn-stack.fixture.js";

describe("IAM CloudFormation User", () => {
  it("creates an IAM User from AWS::IAM::User", async () => {
    // Given a CloudFormation template declaring an IAM User.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-user-stack",
      template: {
        Resources: {
          ApplicationUser: {
            Type: "AWS::IAM::User",
            Properties: {
              UserName: "ReportPublisher",
              Path: "/application/",
            },
          },
        },
      },
    });

    // Then the CloudFormation Resource is backed by a simulated User.
    const resource = stack.getResource("ApplicationUser");

    assertNonNullable(resource);
    assertIdentical(resource.status, "CREATE_COMPLETE");

    const user = resource.simResource as SimIamUser | undefined;

    assertNonNullable(user);
    assertIdentical(user.userName, "ReportPublisher");
    assertIdentical(user.path, "/application/");
    assertIdentical(
      user.arn,
      `arn:aws:iam::${simAws.iam().accountId}:user/application/ReportPublisher`,
    );
    assertIdentical(simAws.iam().users.get(user.userName), user);
  });

  it("names an unnamed User after the stack and the logical ID", async () => {
    // Given a CloudFormation template with a User that omits its name and path.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-user-default-stack",
      template: {
        Resources: {
          DefaultNamedUser: {
            Type: "AWS::IAM::User",
            Properties: {},
          },
        },
      },
    });

    // Then the User is named after the stack and the logical ID, as
    // CloudFormation names one, and takes the root path.
    const resource = stack.getResource("DefaultNamedUser");

    assertNonNullable(resource);

    const user = simAws.iam().users.get(resource.refValue as never);

    assertNonNullable(user);
    assertStringStartsWith(
      user.userName,
      "iam-user-default-stack-DefaultNamedUser-",
    );
    assertIdentical(user.path, "/");
  });

  it("stores inline Policies declared on the User", async () => {
    // Given a CloudFormation template with a User carrying inline Policies.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-user-inline-policy-stack",
      template: {
        Resources: {
          InlinePolicyUser: {
            Type: "AWS::IAM::User",
            Properties: {
              UserName: "InlinePolicyUser",
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

    // Then the inline policy is stored on the created User.
    const resource = stack.getResource("InlinePolicyUser");

    assertNonNullable(resource);

    const user = resource.simResource as SimIamUser | undefined;

    assertNonNullable(user);

    const inlinePolicy = user.inlinePolicies.get("ReadReports");

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

  it("gives the User a login profile from LoginProfile", async () => {
    // Given a CloudFormation template with a User carrying a LoginProfile.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-user-login-profile-stack",
      template: {
        Resources: {
          ConsoleUser: {
            Type: "AWS::IAM::User",
            Properties: {
              UserName: "ConsoleUser",
              LoginProfile: {
                Password: "initial-console-password",
                PasswordResetRequired: true,
              },
            },
          },
        },
      },
    });

    // Then the User holds the password, which no command reports back.
    const resource = stack.getResource("ConsoleUser");

    assertNonNullable(resource);

    const user = resource.simResource as SimIamUser | undefined;

    assertNonNullable(user?.loginProfile);
    assertIdentical(user.loginProfile.password, "initial-console-password");
    assertTrue(user.loginProfile.passwordResetRequired);
  });

  it("defaults PasswordResetRequired on a LoginProfile", async () => {
    // Given a template whose LoginProfile carries only a password.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-user-login-profile-default-stack",
      template: {
        Resources: {
          ConsoleUser: {
            Type: "AWS::IAM::User",
            Properties: {
              LoginProfile: {
                Password: "initial-console-password",
              },
            },
          },
        },
      },
    });

    // Then the User is not asked to change the password at sign-in.
    const resource = stack.getResource("ConsoleUser");

    assertNonNullable(resource);

    const user = resource.simResource as SimIamUser | undefined;

    assertNonNullable(user?.loginProfile);
    assertFalse(user.loginProfile.passwordResetRequired);
  });

  it("uses the User name for Ref and exposes Arn and UserId via Fn::GetAtt", async () => {
    // Given a template with a User, a dependent resource, and Outputs that
    // exercise Ref and Fn::GetAtt resolution.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-user-ref-stack",
      template: {
        Resources: {
          OutputUser: {
            Type: "AWS::IAM::User",
            Properties: {
              UserName: "OutputUser",
            },
          },
          WaitHandle: {
            Type: "AWS::CloudFormation::WaitConditionHandle",
            Properties: {
              UserName: {
                Ref: "OutputUser",
              },
              UserArn: {
                "Fn::GetAtt": ["OutputUser", "Arn"],
              },
              UserId: {
                "Fn::GetAtt": ["OutputUser", "UserId"],
              },
            },
          },
        },
        Outputs: {
          UserName: {
            Value: {
              Ref: "OutputUser",
            },
          },
          UserArn: {
            Value: {
              "Fn::GetAtt": ["OutputUser", "Arn"],
            },
          },
          UserId: {
            Value: {
              "Fn::GetAtt": ["OutputUser", "UserId"],
            },
          },
        },
      },
    });

    // Then Ref returns the User name and Fn::GetAtt returns Arn and UserId.
    const userResource = stack.getResource("OutputUser");
    const waitHandleResource = stack.getResource("WaitHandle");

    assertNonNullable(userResource);
    assertNonNullable(waitHandleResource);

    const user = userResource.simResource as SimIamUser;

    assertIdentical(userResource.refValue, "OutputUser");

    const resolvedWaitHandleProperties = await deployedResourceObject(
      waitHandleResource,
    ).resolvedProperties({
      resources: deployedStackObject(stack).resourceMap,
    });

    assertIdentical(resolvedWaitHandleProperties["UserName"], "OutputUser");
    assertIdentical(resolvedWaitHandleProperties["UserArn"], user.arn);
    assertIdentical(resolvedWaitHandleProperties["UserId"], user.userId);

    assertIdentical(stack.outputs.get("UserName")?.value, "OutputUser");
    assertIdentical(stack.outputs.get("UserArn")?.value, user.arn);
    assertIdentical(stack.outputs.get("UserId")?.value, user.userId);
  });

  it("falls back to an ARN-derived value for unsupported Fn::GetAtt attributes", async () => {
    // Given a template that reads an attribute AWS::IAM::User does not expose
    // via Fn::GetAtt.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-user-unsupported-attribute-stack",
      template: {
        Resources: {
          AttributeUser: {
            Type: "AWS::IAM::User",
            Properties: {
              UserName: "AttributeUser",
            },
          },
        },
        Outputs: {
          UnsupportedAttribute: {
            Value: {
              "Fn::GetAtt": ["AttributeUser", "Path"],
            },
          },
        },
      },
    });

    // Then the fallback attribute value is derived from the User ARN.
    const resource = stack.getResource("AttributeUser");

    assertNonNullable(resource);

    const user = resource.simResource as SimIamUser;

    assertIdentical(
      stack.outputs.get("UnsupportedAttribute")?.value,
      `${user.arn}.Path`,
    );
  });
});
