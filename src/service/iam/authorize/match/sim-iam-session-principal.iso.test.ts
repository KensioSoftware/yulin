import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";

/**
 * Which ARN of an assumed-role session a resource policy names.
 *
 * A session has two: the session itself, and the Role it holds the permissions
 * of. AWS matches a policy naming either, and its own guidance is to name the
 * Role. Both are covered here because naming the Role is the common case and
 * naming one session is the precise one.
 */
describe("A resource policy naming an assumed-role session", () => {
  it("matches a policy naming the Role behind the session", () => {
    // Given a session of a Role, and a policy naming that Role.
    const { simAws, session, roleArn } = sessionCaller();

    // When the session reads the resource the policy is on.
    const decision = simAws.iam().authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::reports/summary.csv",
      caller: session,
      resourcePolicies: [bucketPolicyFor(roleArn)],
    });

    // Then the Role the session holds carried the grant.
    assertIdentical(decision.value, "Allow");
  });

  it("matches a policy naming that session in particular", () => {
    // Given a session of a Role, and a policy naming the session itself.
    const { simAws, session, sessionArn } = sessionCaller();

    // When the session reads the resource the policy is on.
    const decision = simAws.iam().authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::reports/summary.csv",
      caller: session,
      resourcePolicies: [bucketPolicyFor(sessionArn)],
    });

    // Then the session ARN matched.
    assertIdentical(decision.value, "Allow");
  });

  it("leaves a policy naming another Role alone", () => {
    // Given a session of a Role, and a policy naming a different Role.
    const { simAws, session, accountId } = sessionCaller();

    // When the session reads the resource the policy is on.
    const decision = simAws.iam().authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::reports/summary.csv",
      caller: session,
      resourcePolicies: [
        bucketPolicyFor(`arn:aws:iam::${accountId}:role/Other`),
      ],
    });

    // Then neither of the session's two ARNs matched it.
    assertIdentical(decision.value, "ImplicitDeny");
  });
});

function bucketPolicyFor(principalArn: string) {
  return {
    sourceType: "resource" as const,
    policyName: "BucketPolicy",
    resourceArn: "arn:aws:s3:::reports",
    document: {
      Version: "2012-10-17" as const,
      Statement: {
        Effect: "Allow" as const,
        Principal: { AWS: principalArn },
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::reports/*",
      },
    },
  };
}

function sessionCaller(): {
  simAws: SimAws;
  session: SimAwsCaller;
  roleArn: string;
  sessionArn: string;
  accountId: string;
} {
  const accountId = makeSimAwsAccountId();
  const roleArn = `arn:aws:iam::${accountId}:role/Reporting`;
  const sessionArn = `arn:aws:sts::${accountId}:assumed-role/Reporting/one`;

  return {
    simAws: new SimAws({ defaultAccountId: accountId }),
    session: {
      kind: "resolved",
      principal: { kind: "arn", arn: sessionArn },
      identityPolicyPrincipal: { kind: "arn", arn: roleArn },
    },
    roleArn,
    sessionArn,
    accountId,
  };
}
