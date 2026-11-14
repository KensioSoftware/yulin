import {
  CreatePolicyCommand,
  CreateRoleCommand,
  CreateUserCommand,
  PutRolePolicyCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  assertFalse,
  assertIdentical,
  assertArrayLength,
  assertNonNullable,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIam } from "../../sim-iam.js";
import { simIamPolicyDocumentFactory } from "../../policy/sim-iam-policy-document.factory.js";
import type { SimIamPolicyDocumentStatement } from "../../policy/sim-iam-policy.js";

const objectArn = "arn:aws:s3:::reports/summary.csv";

/**
 * A simulation holding a boundary policy that allows S3 and denies deletes.
 */
async function boundedAccount(): Promise<{
  readonly simIam: SimIam;
  readonly boundaryArn: string;
}> {
  const simIam = new SimAws().account(makeSimAwsAccountId()).iam();
  const boundary = await simIam.createPolicy(
    new CreatePolicyCommand({
      PolicyName: "S3Boundary",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: [
          { Effect: "Allow", Action: "s3:*", Resource: "*" },
          { Effect: "Deny", Action: "s3:DeleteObject", Resource: "*" },
        ],
      }),
    }),
  );
  assertNonNullable(boundary.Policy.Arn);

  return { simIam, boundaryArn: boundary.Policy.Arn };
}

/**
 * A User under the boundary, whose own policy allows everything.
 */
async function boundedUser(
  simIam: SimIam,
  boundaryArn: string | undefined,
): Promise<string> {
  const created = await simIam.createUser(
    new CreateUserCommand({
      UserName: "analyst",
      PermissionsBoundary: boundaryArn,
    }),
  );
  await simIam.putUserPolicy(
    new PutUserPolicyCommand({
      UserName: "analyst",
      PolicyName: "everything",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: "*", Resource: "*" },
      }),
    }),
  );
  assertNonNullable(created.User.Arn);

  return created.User.Arn;
}

/**
 * A session of a Role under the boundary, whose own policy allows everything.
 */
async function boundedRoleSession(
  simIam: SimIam,
  boundaryArn: string,
): Promise<{ readonly caller: SimAwsCaller; readonly roleArn: string }> {
  const created = await simIam.createRole(
    new CreateRoleCommand({
      RoleName: "Worker",
      PermissionsBoundary: boundaryArn,
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );
  await simIam.putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "Worker",
      PolicyName: "everything",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: "*", Resource: "*" },
      }),
    }),
  );
  const roleArn = created.Role.Arn;
  assertNonNullable(roleArn);

  return {
    roleArn,
    caller: {
      kind: "resolved",
      principal: {
        kind: "arn",
        arn: `arn:aws:sts::${simIam.accountId}:assumed-role/Worker/job`,
      },
      identityPolicyPrincipal: { kind: "arn", arn: roleArn },
    },
  };
}

/**
 * A queue policy allowing one principal to receive messages.
 */
function queuePolicyFor(principal: string): {
  readonly document: {
    readonly Version: string;
    readonly Statement: SimIamPolicyDocumentStatement;
  };
} {
  return {
    document: {
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: principal },
        Action: "sqs:ReceiveMessage",
        Resource: "*",
      },
    },
  };
}

describe("sim IAM permissions boundaries", () => {
  it("allows what both the boundary and the identity policy allow", async () => {
    // Given a User whose boundary allows S3
    const { simIam, boundaryArn } = await boundedAccount();
    const userArn = await boundedUser(simIam, boundaryArn);

    // When the User reads an object
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: objectArn,
      caller: { kind: "arn", arn: userArn },
    });

    // Then it is allowed, by the boundary's S3 statement
    assertTrue(decision.isAllowed);
    assertTrue(decision.principalLimits.permissionsBoundary.isApplied);
    assertArrayLength(
      decision.principalLimits.permissionsBoundary.allowStatements,
      1,
    );
  });

  it("denies what the boundary leaves out, and says so", async () => {
    // Given a User whose boundary allows only S3
    const { simIam, boundaryArn } = await boundedAccount();
    const userArn = await boundedUser(simIam, boundaryArn);

    // When the User reads a queue its own policy allows
    const decision = simIam.authorize({
      action: "sqs:ReceiveMessage",
      resource: "arn:aws:sqs:eu-west-2:111122223333:jobs",
      caller: { kind: "arn", arn: userArn },
    });

    // Then the boundary denies it implicitly
    assertTrue(decision.isImplicitDeny);
    assertIdentical(
      decision.denialReason,
      "because no permissions boundary allows the sqs:ReceiveMessage action",
    );
  });

  it("denies explicitly with a Deny statement in the boundary", async () => {
    // Given a User whose boundary denies deletes
    const { simIam, boundaryArn } = await boundedAccount();
    const userArn = await boundedUser(simIam, boundaryArn);

    // When the User deletes an object
    const decision = simIam.authorize({
      action: "s3:DeleteObject",
      resource: objectArn,
      caller: { kind: "arn", arn: userArn },
    });

    // Then the boundary denies it explicitly, with its Deny statement
    assertTrue(decision.isExplicitDeny);
    assertArrayLength(
      decision.principalLimits.permissionsBoundary.denyStatements,
      1,
    );
    assertIdentical(
      decision.denialReason,
      "with an explicit deny in a permissions boundary",
    );
  });

  it("leaves a User with no boundary unrestricted", async () => {
    // Given a User with no boundary
    const { simIam } = await boundedAccount();
    const userArn = await boundedUser(simIam, undefined);

    // When the User reads a queue
    const decision = simIam.authorize({
      action: "sqs:ReceiveMessage",
      resource: "arn:aws:sqs:eu-west-2:111122223333:jobs",
      caller: { kind: "arn", arn: userArn },
    });

    // Then its own policy allows it
    assertTrue(decision.isAllowed);
    assertFalse(decision.principalLimits.permissionsBoundary.isApplied);
  });

  it("allows nothing through a boundary naming a missing policy", async () => {
    // Given a User whose boundary names no policy the Account holds
    const { simIam } = await boundedAccount();
    const userArn = await boundedUser(
      simIam,
      `arn:aws:iam::${simIam.accountId}:policy/Missing`,
    );

    // When the User reads an object
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: objectArn,
      caller: { kind: "arn", arn: userArn },
    });

    // Then nothing allows it
    assertTrue(decision.isImplicitDeny);
  });

  it("lets a resource policy naming the User past the boundary", async () => {
    // Given a User whose boundary allows only S3, named by a queue's policy
    const { simIam, boundaryArn } = await boundedAccount();
    const userArn = await boundedUser(simIam, boundaryArn);

    // When the User receives from the queue
    const decision = simIam.authorize({
      action: "sqs:ReceiveMessage",
      resource: "arn:aws:sqs:eu-west-2:111122223333:jobs",
      caller: { kind: "arn", arn: userArn },
      resourcePolicies: [queuePolicyFor(userArn)],
    });

    // Then the resource policy allows it on its own
    assertTrue(decision.isAllowed);
  });

  it("limits a resource policy naming a session's Role, and not one naming the session", async () => {
    // Given a session of a Role whose boundary allows only S3
    const { simIam, boundaryArn } = await boundedAccount();
    const { caller, roleArn } = await boundedRoleSession(simIam, boundaryArn);
    const receive = (principal: string): boolean =>
      simIam.authorize({
        action: "sqs:ReceiveMessage",
        resource: "arn:aws:sqs:eu-west-2:111122223333:jobs",
        caller,
        resourcePolicies: [queuePolicyFor(principal)],
      }).isAllowed;

    // When a queue's policy names the Role, the session, or everyone
    // Then only the grant naming the Role is held back by the boundary
    assertFalse(receive(roleArn));
    assertTrue(
      receive(`arn:aws:sts::${simIam.accountId}:assumed-role/Worker/job`),
    );
    assertTrue(receive("*"));
  });

  it("limits a resource policy naming a Role its caller is named by", async () => {
    // Given a Role whose boundary allows only S3, named as the caller itself
    const { simIam, boundaryArn } = await boundedAccount();
    const { roleArn } = await boundedRoleSession(simIam, boundaryArn);

    // When the Role receives from a queue whose policy names it
    const decision = simIam.authorize({
      action: "sqs:ReceiveMessage",
      resource: "arn:aws:sqs:eu-west-2:111122223333:jobs",
      caller: { kind: "arn", arn: roleArn },
      resourcePolicies: [queuePolicyFor(roleArn)],
    });

    // Then the boundary holds the grant back, as it does for a session
    assertTrue(decision.isImplicitDeny);
  });

  it("keeps a wildcard grant listed beside a session's Role", async () => {
    // Given a session of a bounded Role, and a queue policy naming both the
    // Role and everyone
    const { simIam, boundaryArn } = await boundedAccount();
    const { caller, roleArn } = await boundedRoleSession(simIam, boundaryArn);

    // When the session receives from the queue
    const decision = simIam.authorize({
      action: "sqs:ReceiveMessage",
      resource: "arn:aws:sqs:eu-west-2:111122223333:jobs",
      caller,
      resourcePolicies: [
        {
          document: {
            Version: "2012-10-17",
            Statement: {
              Effect: "Allow",
              Principal: { AWS: [roleArn, "*"] },
              Action: "sqs:ReceiveMessage",
              Resource: "*",
            },
          },
        },
      ],
    });

    // Then the wildcard alternative allows it past the boundary
    assertTrue(decision.isAllowed);
  });

  it("denies through a resource policy where the boundary has a Deny", async () => {
    // Given a User whose boundary denies deletes, named by a bucket policy
    const { simIam, boundaryArn } = await boundedAccount();
    const userArn = await boundedUser(simIam, boundaryArn);

    // When the User deletes an object the bucket policy allows it to
    const decision = simIam.authorize({
      action: "s3:DeleteObject",
      resource: objectArn,
      caller: { kind: "arn", arn: userArn },
      resourcePolicies: [
        {
          document: {
            Version: "2012-10-17",
            Statement: {
              Effect: "Allow",
              Principal: { AWS: userArn },
              Action: "s3:DeleteObject",
              Resource: objectArn,
            },
          },
        },
      ],
    });

    // Then the Deny wins
    assertTrue(decision.isExplicitDeny);
  });

  it("caps a cross-Account caller by its own Account's boundary", async () => {
    // Given a User in one Account bounded to S3, and a queue in another
    // Account whose policy names it
    const simAws = new SimAws();
    const callerIam = simAws.account(makeSimAwsAccountId()).iam();
    const boundary = await callerIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "S3Boundary",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "s3:*", Resource: "*" },
        }),
      }),
    );
    const userArn = await boundedUser(callerIam, boundary.Policy.Arn);
    const queueIam = simAws.account(makeSimAwsAccountId()).iam();

    // When the User receives from the queue
    const decision = queueIam.authorize({
      action: "sqs:ReceiveMessage",
      resource: `arn:aws:sqs:eu-west-2:${queueIam.accountId}:jobs`,
      caller: { kind: "arn", arn: userArn },
      resourcePolicies: [queuePolicyFor(userArn)],
    });

    // Then the caller's boundary leaves its side unable to allow it
    assertTrue(decision.isImplicitDeny);
    assertTrue(decision.principalLimits.permissionsBoundary.isApplied);
  });
});
