import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import { CreateRoleCommand, CreateUserCommand } from "@aws-sdk/client-iam";
import { assertArrayLength, assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamPolicyDocumentCondition } from "../../policy/sim-iam-policy.js";
import { simIamPolicyDocumentFactory } from "../../policy/sim-iam-policy-document.factory.js";
import { simIamAuthZResourcePolicySourceFactory } from "./sim-iam-auth-z-context.factory.js";

const reportObject = "arn:aws:s3:::reports-bucket/summary.csv";

/**
 * Whether a resource policy allowing a read on one condition allows a caller.
 */
function allowed(
  simAws: SimAws,
  caller: SimAwsCaller,
  condition: SimIamPolicyDocumentCondition,
): boolean {
  return simAws.iam().authorize({
    action: "s3:GetObject",
    resource: reportObject,
    caller,
    resourcePolicies: [
      simIamAuthZResourcePolicySourceFactory.make({
        document: {
          Statement: {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: reportObject,
            Condition: condition,
          },
        },
      }),
    ],
  }).isAllowed;
}

/**
 * A simulation holding a Role tagged team=reports, trusted by its Account
 * root.
 */
async function simulationWithTaggedRole(): Promise<SimAws> {
  const accountId = makeSimAwsAccountId();
  const simAws = new SimAws({ defaultAccountId: accountId });

  await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "ReportsRole",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
      Tags: [{ Key: "team", Value: "reports" }],
    }),
  );

  return simAws;
}

describe("sim IAM principal condition keys", () => {
  it("carries a Role's tags as aws:PrincipalTag on its sessions", async () => {
    // Given a Role tagged team=reports, and a session of it
    const simAws = await simulationWithTaggedRole();
    const session = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: `arn:aws:iam::${simAws.defaultAccountId}:role/ReportsRole`,
        RoleSessionName: "nightly",
      }),
    );
    const caller: SimAwsCaller = {
      kind: "arn",
      arn: session.AssumedRoleUser?.Arn ?? "",
    };

    // When the session reads under conditions on its tag, type and id
    // Then each condition sees what AWS supplies for a Role session
    assertTrue(
      allowed(simAws, caller, {
        StringEquals: {
          "aws:PrincipalTag/team": "reports",
          "aws:PrincipalType": "AssumedRole",
          "aws:PrincipalAccount": simAws.defaultAccountId,
        },
        StringLike: { "aws:userid": "AROA*:nightly" },
      }),
    );
    assertFalse(
      allowed(simAws, caller, {
        StringEquals: { "aws:PrincipalTag/team": "orders" },
      }),
    );
  });

  it("describes an IAM User by name, id and tags", async () => {
    // Given a User tagged stage=prod
    const simAws = new SimAws();
    const creation = await simAws.iam().createUser(
      new CreateUserCommand({
        UserName: "reporting",
        Tags: [{ Key: "stage", Value: "prod" }],
      }),
    );
    const caller: SimAwsCaller = { kind: "arn", arn: creation.User.Arn };

    // When the User reads under conditions on its name, id, type and tag
    // Then each condition sees the User
    assertTrue(
      allowed(simAws, caller, {
        StringEquals: {
          "aws:username": "reporting",
          "aws:userid": creation.User.UserId,
          "aws:PrincipalType": "User",
          "aws:PrincipalTag/stage": "prod",
        },
      }),
    );
  });

  it("describes the Account root by its Account", () => {
    // Given a simulation
    const simAws = new SimAws();
    const caller: SimAwsCaller = {
      kind: "arn",
      arn: `arn:aws:iam::${simAws.defaultAccountId}:root`,
    };

    // When the root reads under conditions on its type and id
    // Then both name the Account, and the root has no user name
    assertTrue(
      allowed(simAws, caller, {
        StringEquals: {
          "aws:PrincipalType": "Account",
          "aws:userid": simAws.defaultAccountId,
        },
        Null: { "aws:username": "true" },
      }),
    );
  });

  it("describes a service principal as an AWS service", () => {
    // Given a simulation
    const simAws = new SimAws();

    // When a service reads under conditions on being one
    // Then the service is named and has no principal type
    assertTrue(
      allowed(
        simAws,
        { kind: "service", service: "lambda.amazonaws.com" },
        {
          Bool: { "aws:PrincipalIsAWSService": "true" },
          StringEquals: { "aws:PrincipalServiceName": "lambda.amazonaws.com" },
          Null: { "aws:PrincipalType": "true" },
        },
      ),
    );
  });

  it("describes an anonymous caller", () => {
    // Given a simulation
    const simAws = new SimAws();

    // When an anonymous caller reads under conditions on its type and id
    // Then both say anonymous
    assertTrue(
      allowed(
        simAws,
        { kind: "anonymous" },
        {
          StringEquals: {
            "aws:PrincipalType": "Anonymous",
            "aws:userid": "anonymous",
          },
          Bool: { "aws:PrincipalIsAWSService": "false" },
        },
      ),
    );
  });

  it("reads the tags of a caller from another Account in the simulation", async () => {
    // Given a Role tagged team=reports in one Account
    const simAws = await simulationWithTaggedRole();
    const otherAccount = makeSimAwsAccountId();
    const caller: SimAwsCaller = {
      kind: "arn",
      arn: `arn:aws:iam::${simAws.defaultAccountId}:role/ReportsRole`,
    };

    // When it reads a resource in another Account under a condition on its tag
    const decision = simAws
      .account(otherAccount)
      .iam()
      .authorize({
        action: "s3:GetObject",
        resource: reportObject,
        caller,
        resourcePolicies: [
          simIamAuthZResourcePolicySourceFactory.make({
            document: {
              Statement: {
                Effect: "Allow",
                Principal: "*",
                Action: "s3:GetObject",
                Resource: reportObject,
                Condition: {
                  StringEquals: {
                    "aws:PrincipalTag/team": "reports",
                    "aws:PrincipalAccount": simAws.defaultAccountId,
                  },
                },
              },
            },
          }),
        ],
      });

    // Then the resource's Account reads the tag from the caller's Account
    assertArrayLength(decision.resourceAllowStatements, 1);
  });

  it.each([
    ["a User", "user/missing", "User"],
    ["a Role session", "assumed-role/MissingRole/nightly", "AssumedRole"],
  ])(
    "describes %s the simulation holds no record of by its type alone",
    (_, resource, principalType) => {
      // Given a simulation without the named principal
      const simAws = new SimAws();
      const caller: SimAwsCaller = {
        kind: "arn",
        arn: `arn:aws:iam::${simAws.defaultAccountId}:${resource}`,
      };

      // When it reads under conditions on its type and id
      // Then the type is known and the id is absent
      assertTrue(
        allowed(simAws, caller, {
          StringEquals: { "aws:PrincipalType": principalType },
          Null: { "aws:userid": "true" },
        }),
      );
    },
  );

  it("describes a federated user by its Account alone", () => {
    // Given a simulation
    const simAws = new SimAws();
    const caller: SimAwsCaller = {
      kind: "arn",
      arn: `arn:aws:sts::${simAws.defaultAccountId}:federated-user/visitor`,
    };

    // When it reads under conditions on its Account and type
    // Then the Account is known and the type is left out
    assertTrue(
      allowed(simAws, caller, {
        StringEquals: { "aws:PrincipalAccount": simAws.defaultAccountId },
        Null: { "aws:PrincipalType": "true" },
      }),
    );
  });
});
