import {
  CreateGroupCommand,
  CreateInstanceProfileCommand,
  CreatePolicyCommand,
  CreatePolicyVersionCommand,
  CreateRoleCommand,
  CreateUserCommand,
  GetAccountSummaryCommand,
} from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimIamEntityAlreadyExists,
  SimIamLimitExceeded,
} from "../../error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../policy/sim-iam-policy-document.factory.js";
import type { SimIam } from "../../sim-iam.js";

const readObjects = simIamPolicyDocumentFactory.make({
  Statement: { Action: "s3:GetObject", Resource: "*" },
});

function makeIam(): SimIam {
  return new SimAws().account(makeSimAwsAccountId()).iam();
}

describe("IAM Account quotas", () => {
  it("summarises what the Account holds against its quotas", async () => {
    // Given an Account holding one of each entity, and a policy with two
    // versions
    const iam = makeIam();
    await iam.createRole(
      new CreateRoleCommand({
        RoleName: "Worker",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { Service: "ec2.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await iam.createUser(new CreateUserCommand({ UserName: "analyst" }));
    await iam.createGroup(new CreateGroupCommand({ GroupName: "Readers" }));
    await iam.createInstanceProfile(
      new CreateInstanceProfileCommand({ InstanceProfileName: "Worker" }),
    );
    const { Policy } = await iam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "Read",
        PolicyDocument: readObjects,
      }),
    );
    await iam.createPolicyVersion(
      new CreatePolicyVersionCommand({
        PolicyArn: Policy.Arn,
        PolicyDocument: readObjects,
      }),
    );

    // When the Account summary is asked for
    const { SummaryMap } = await iam.getAccountSummary(
      new GetAccountSummaryCommand({}),
    );

    // Then it counts each entity alongside IAM's default quota
    assertIdentical(SummaryMap.Roles, 1);
    assertIdentical(SummaryMap.RolesQuota, 1000);
    assertIdentical(SummaryMap.Users, 1);
    assertIdentical(SummaryMap.UsersQuota, 5000);
    assertIdentical(SummaryMap.Groups, 1);
    assertIdentical(SummaryMap.GroupsQuota, 300);
    assertIdentical(SummaryMap.InstanceProfiles, 1);
    assertIdentical(SummaryMap.Policies, 1);
    assertIdentical(SummaryMap.PolicyVersionsInUse, 2);
    assertIdentical(SummaryMap.UserPolicySizeQuota, 2048);
  });

  it("refuses an entity past the Account's quota for its kind", async () => {
    // Given an Account holding 300 groups
    const iam = makeIam();
    await Promise.all(
      Array.from({ length: 300 }, async (_, index) =>
        iam.createGroup(
          new CreateGroupCommand({ GroupName: `G${String(index)}` }),
        ),
      ),
    );

    // When a 301st is created
    const error = await assertThrowsErrorAsync(async () =>
      iam.createGroup(new CreateGroupCommand({ GroupName: "OneTooMany" })),
    );

    // Then IAM refuses it
    assertInstanceOf(error, SimIamLimitExceeded);
    assertIdentical(
      error.message,
      "Cannot exceed quota for GroupsPerAccount: 300",
    );
  });

  it("refuses a Role or User name the Account holds in another case", async () => {
    // Given a Role and a User
    const iam = makeIam();
    const AssumeRolePolicyDocument = simIamPolicyDocumentFactory.make({
      Statement: {
        Principal: { Service: "ec2.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    });
    await iam.createRole(
      new CreateRoleCommand({ RoleName: "Worker", AssumeRolePolicyDocument }),
    );
    await iam.createUser(new CreateUserCommand({ UserName: "Analyst" }));

    // When each is created again in lower case
    const role = await assertThrowsErrorAsync(async () =>
      iam.createRole(
        new CreateRoleCommand({ RoleName: "worker", AssumeRolePolicyDocument }),
      ),
    );
    const user = await assertThrowsErrorAsync(async () =>
      iam.createUser(new CreateUserCommand({ UserName: "analyst" })),
    );

    // Then IAM holds the two names as one
    assertInstanceOf(role, SimIamEntityAlreadyExists);
    assertInstanceOf(user, SimIamEntityAlreadyExists);
  });
});
