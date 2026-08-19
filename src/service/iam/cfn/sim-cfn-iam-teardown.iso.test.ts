import {
  assertIdentical,
  assertMapSize,
  assertSetSize,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimIamRole } from "../role/sim-iam-role.js";
import type { SimIamUser } from "../user/sim-iam-user.js";

const assumeRolePolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
};

const readObjectsDocument = {
  Version: "2012-10-17",
  Statement: [
    { Effect: "Allow", Action: "s3:GetObject", Resource: "arn:aws:s3:::*/*" },
  ],
};

const template = {
  Resources: {
    ReadPolicy: {
      Type: "AWS::IAM::ManagedPolicy",
      Properties: {
        ManagedPolicyName: "read-objects",
        PolicyDocument: readObjectsDocument,
      },
    },
    HandlerRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        RoleName: "handler-role",
        AssumeRolePolicyDocument: assumeRolePolicyDocument,
        ManagedPolicyArns: [{ Ref: "ReadPolicy" }],
        Policies: [
          {
            PolicyName: "inline-read",
            PolicyDocument: readObjectsDocument,
          },
        ],
      },
    },
    HandlerDefaultPolicy: {
      Type: "AWS::IAM::Policy",
      Properties: {
        PolicyName: "handler-default",
        Roles: [{ Ref: "HandlerRole" }],
        PolicyDocument: readObjectsDocument,
      },
    },
  },
};

const userTemplate = {
  Resources: {
    PublishPolicy: {
      Type: "AWS::IAM::ManagedPolicy",
      Properties: {
        ManagedPolicyName: "publish-objects",
        PolicyDocument: readObjectsDocument,
      },
    },
    PublisherUser: {
      Type: "AWS::IAM::User",
      Properties: {
        UserName: "publisher-user",
        ManagedPolicyArns: [{ Ref: "PublishPolicy" }],
        Policies: [
          {
            PolicyName: "inline-publish",
            PolicyDocument: readObjectsDocument,
          },
        ],
      },
    },
  },
};

describe("IAM CloudFormation Resource teardown", () => {
  it("takes a Role's policies off it before deleting the Role", async () => {
    // Given a deployed Role carrying an attached managed policy and two inline
    // policies, one declared on the Role and one as its own Resource. IAM
    // refuses DeleteRole while any of them are still on it.
    const simAws = new SimAws();
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "handler-stack", template });

    const role = stack.resources.get("HandlerRole")?.simResource as
      | SimIamRole
      | undefined;
    assertIdentical(role?.roleName, "handler-role");
    assertSetSize(role.attachedPolicyArns, 1);
    assertMapSize(role.inlinePolicies, 2);

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the Role is gone, along with the managed policy it used.
    await assertThrowsErrorAsync(async () =>
      simAws.iam().getRole({ input: { RoleName: "handler-role" } }),
    );
    assertUndefined(simAws.iam().roles.get(role.roleName));
    assertIdentical(
      stack.resources.get("ReadPolicy")?.status,
      "DELETE_COMPLETE",
    );
  });

  it("takes a User's policies off it before deleting the User", async () => {
    // Given a deployed User carrying an attached managed policy and an inline
    // policy. IAM refuses DeleteUser while either of them is still on it.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "publisher-stack",
      template: userTemplate,
    });

    const user = stack.resources.get("PublisherUser")?.simResource as
      | SimIamUser
      | undefined;
    assertIdentical(user?.userName, "publisher-user");
    assertSetSize(user.attachedPolicyArns, 1);
    assertMapSize(user.inlinePolicies, 1);

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the User is gone, along with the managed policy it used.
    assertUndefined(simAws.iam().users.get(user.userName));
    assertMapSize(simAws.iam().policies, 0);
    assertIdentical(
      stack.resources.get("PublisherUser")?.status,
      "DELETE_COMPLETE",
    );
  });

  it("redeploys the same template into the Account the first Stack left", async () => {
    // Given a deployed Stack naming its User, which CreateUser refuses a
    // second time while the first User still holds the name.
    const simAws = new SimAws();
    const first = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "publisher-stack", template: userTemplate });
    await first.teardown();

    // When the same template is deployed into the same Account again.
    const second = await simAws.cloudFormation().deployTemplate({
      stackName: "publisher-stack-again",
      template: userTemplate,
    });

    // Then the Stack reaches its User, with the name free to take again.
    const user = second.resources.get("PublisherUser")?.simResource as
      | SimIamUser
      | undefined;
    assertIdentical(user?.userName, "publisher-user");
    assertIdentical(
      simAws.iam().users.get(user.userName)?.userName,
      "publisher-user",
    );
  });

  it("removes an AWS::IAM::Policy from the Roles it names", async () => {
    // Given a Role declared outside the Stack, so it outlives the teardown and
    // can be asked what is still on it.
    const simAws = new SimAws();
    await simAws.iam().createRole({
      input: {
        RoleName: "standing-role",
        AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicyDocument),
      },
    });

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "policy-only-stack",
      template: {
        Resources: {
          StandingPolicy: {
            Type: "AWS::IAM::Policy",
            Properties: {
              PolicyName: "standing-default",
              Roles: ["standing-role"],
              PolicyDocument: readObjectsDocument,
            },
          },
        },
      },
    });

    const role = simAws.iam().roles.get("standing-role" as never);
    assertMapSize(role?.inlinePolicies, 1);

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the inline policy is off the Role, which is still there.
    assertMapSize(role.inlinePolicies, 0);
    assertIdentical(
      stack.resources.get("StandingPolicy")?.status,
      "DELETE_COMPLETE",
    );
  });

  it("deletes a Managed Policy the Stack attached to a Role it also created", async () => {
    // Given a Stack whose Managed Policy names the Role the Stack created, so
    // the policy is attached the moment it exists. IAM refuses DeletePolicy
    // while an attachment is live.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "attached-policy-stack",
      template: {
        Resources: {
          WorkerRole: {
            Type: "AWS::IAM::Role",
            Properties: {
              RoleName: "worker-role",
              AssumeRolePolicyDocument: assumeRolePolicyDocument,
            },
          },
          WorkerReadPolicy: {
            Type: "AWS::IAM::ManagedPolicy",
            Properties: {
              ManagedPolicyName: "worker-read",
              Roles: [{ Ref: "WorkerRole" }],
              PolicyDocument: readObjectsDocument,
            },
          },
        },
      },
    });

    const role = stack.resources.get("WorkerRole")?.simResource as
      | SimIamRole
      | undefined;
    assertSetSize(role?.attachedPolicyArns, 1);

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then both the Managed Policy and the Role it was attached to are gone.
    assertIdentical(
      stack.resources.get("WorkerReadPolicy")?.status,
      "DELETE_COMPLETE",
    );
    assertUndefined(simAws.iam().roles.get(role.roleName));
    assertMapSize(simAws.iam().policies, 0);
  });

  it("takes a Managed Policy off a Role that outlives the Stack", async () => {
    // Given a Role declared outside the Stack, so nothing else takes the
    // Managed Policy off it as the Stack is torn down.
    const simAws = new SimAws();
    await simAws.iam().createRole({
      input: {
        RoleName: "standing-worker",
        AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicyDocument),
      },
    });

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "standing-role-policy-stack",
      template: {
        Resources: {
          StandingReadPolicy: {
            Type: "AWS::IAM::ManagedPolicy",
            Properties: {
              ManagedPolicyName: "standing-read",
              Roles: ["standing-worker"],
              PolicyDocument: readObjectsDocument,
            },
          },
        },
      },
    });

    const role = simAws.iam().roles.get("standing-worker" as never);
    assertSetSize(role?.attachedPolicyArns, 1);

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the attachment is off the Role, which is still there, and the
    // Managed Policy is deleted.
    assertSetSize(role.attachedPolicyArns, 0);
    assertIdentical(
      stack.resources.get("StandingReadPolicy")?.status,
      "DELETE_COMPLETE",
    );
    assertMapSize(simAws.iam().policies, 0);
  });
});
