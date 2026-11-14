import {
  CreatePolicyCommand,
  CreateRoleCommand,
  PutRolePolicyCommand,
} from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringEndsWith,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import {
  SimIamAccessDenied,
  SimIamMalformedPolicyDocument,
  SimIamValidationError,
} from "../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";

const objectArn = "arn:aws:s3:::reports/summary.csv";

/**
 * A simulation holding a Role its Account root may assume, whose own policy
 * allows everything.
 */
async function assumableRole(): Promise<{
  readonly simAws: SimAws;
  readonly roleArn: string;
}> {
  const simAws = new SimAws({ defaultAccountId: makeSimAwsAccountId() });
  const accountId = simAws.iam().accountId;
  await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "Analyst",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );
  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "Analyst",
      PolicyName: "everything",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: "*", Resource: "*" },
      }),
    }),
  );

  return { simAws, roleArn: `arn:aws:iam::${accountId}:role/Analyst` };
}

/**
 * The caller holding the credentials one AssumeRole answer hands back.
 */
async function sessionCaller(
  simAws: SimAws,
  input: ConstructorParameters<typeof AssumeRoleCommand>[0],
): Promise<SimAwsCaller> {
  const output = await simAws.sts().assumeRole(new AssumeRoleCommand(input));
  const credentials = output.Credentials;
  assertNonNullable(credentials?.AccessKeyId);
  assertNonNullable(credentials.SecretAccessKey);

  return {
    kind: "credentials",
    credentials: {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
    },
  };
}

const readOnly = simIamPolicyDocumentFactory.make({
  Statement: { Action: "s3:GetObject", Resource: "*" },
});

describe("STS AssumeRole session policies", () => {
  it("caps the session at what the inline session policy allows", async () => {
    // Given a session of an all-powerful Role, limited to reads
    const { simAws, roleArn } = await assumableRole();
    const caller = await sessionCaller(simAws, {
      RoleArn: roleArn,
      RoleSessionName: "reader",
      Policy: readOnly,
    });
    const decide = (action: string) =>
      simAws.iam().authorize({ action, resource: objectArn, caller });

    // When the session reads and writes an object
    const write = decide("s3:PutObject");

    // Then only the read is allowed, and the write names the session policy
    assertTrue(decide("s3:GetObject").isAllowed);
    assertTrue(write.isImplicitDeny);
    assertIdentical(
      write.denialReason,
      "because no session policy allows the s3:PutObject action",
    );
  });

  it("grants nothing the Role's own policies leave out", async () => {
    // Given a Role allowed only reads, assumed with a session policy allowing
    // everything
    const { simAws, roleArn } = await assumableRole();
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Analyst",
        PolicyName: "everything",
        PolicyDocument: readOnly,
      }),
    );
    const caller = await sessionCaller(simAws, {
      RoleArn: roleArn,
      RoleSessionName: "reader",
      Policy: simIamPolicyDocumentFactory.make({
        Statement: { Action: "*", Resource: "*" },
      }),
    });

    // When the session writes an object
    const decision = simAws
      .iam()
      .authorize({ action: "s3:PutObject", resource: objectArn, caller });

    // Then the Role's own policies still deny it
    assertTrue(decision.isImplicitDeny);
    assertUndefined(decision.denialReason);
  });

  it("caps the session at what managed session policies allow", async () => {
    // Given a session limited by a managed policy in the Role's Account
    const { simAws, roleArn } = await assumableRole();
    const policy = await simAws.iam().createPolicy(
      new CreatePolicyCommand({
        PolicyName: "ReadOnly",
        PolicyDocument: readOnly,
      }),
    );
    const caller = await sessionCaller(simAws, {
      RoleArn: roleArn,
      RoleSessionName: "reader",
      PolicyArns: [{ arn: policy.Policy.Arn }],
    });
    const allowed = (action: string): boolean =>
      simAws.iam().authorize({ action, resource: objectArn, caller }).isAllowed;

    // When the session reads and writes
    // Then only the read is allowed
    assertTrue(allowed("s3:GetObject"));
    assertFalse(allowed("s3:PutObject"));
  });

  it("allows nothing through a managed session policy that does not exist", async () => {
    // Given a session limited by an ARN naming no policy
    const { simAws, roleArn } = await assumableRole();
    const caller = await sessionCaller(simAws, {
      RoleArn: roleArn,
      RoleSessionName: "reader",
      PolicyArns: [
        { arn: `arn:aws:iam::${simAws.iam().accountId}:policy/Missing` },
        {},
      ],
    });

    // When the session reads
    const decision = simAws
      .iam()
      .authorize({ action: "s3:GetObject", resource: objectArn, caller });

    // Then nothing allows it
    assertTrue(decision.isImplicitDeny);
    assertTrue(decision.principalLimits.sessionPolicy.isApplied);
  });

  it("lets a resource policy naming the session past the session policy", async () => {
    // Given a read-only session, and a bucket policy naming the session
    const { simAws, roleArn } = await assumableRole();
    const caller = await sessionCaller(simAws, {
      RoleArn: roleArn,
      RoleSessionName: "reader",
      Policy: readOnly,
    });
    const sessionArn = `arn:aws:sts::${simAws.iam().accountId}:assumed-role/Analyst/reader`;
    const write = (principal: string): boolean =>
      simAws.iam().authorize({
        action: "s3:PutObject",
        resource: objectArn,
        caller,
        resourcePolicies: [
          {
            document: {
              Version: "2012-10-17",
              Statement: {
                Effect: "Allow",
                Principal: { AWS: principal },
                Action: "s3:PutObject",
                Resource: objectArn,
              },
            },
          },
        ],
      }).isAllowed;

    // When the session writes under a policy naming it, and one naming its Role
    // Then only the grant naming the session gets past the session policy
    assertTrue(write(sessionArn));
    assertFalse(write(roleArn));
  });

  it("denies explicitly with a Deny statement in the session policy", async () => {
    // Given a session whose policy denies writes
    const { simAws, roleArn } = await assumableRole();
    const caller = await sessionCaller(simAws, {
      RoleArn: roleArn,
      RoleSessionName: "reader",
      Policy: simIamPolicyDocumentFactory.make({
        Statement: [
          { Effect: "Allow", Action: "*", Resource: "*" },
          { Effect: "Deny", Action: "s3:PutObject", Resource: "*" },
        ],
      }),
    });

    // When the session writes
    const decision = simAws
      .iam()
      .authorize({ action: "s3:PutObject", resource: objectArn, caller });

    // Then the session policy denies it explicitly
    assertTrue(decision.isExplicitDeny);
    assertIdentical(
      decision.denialReason,
      "with an explicit deny in a session policy",
    );
  });

  it("refuses an inline session policy that is not JSON", async () => {
    // Given a Role its Account root may assume
    const { simAws, roleArn } = await assumableRole();

    // When the Role is assumed with a policy that does not parse
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sts().assumeRole(
        new AssumeRoleCommand({
          RoleArn: roleArn,
          RoleSessionName: "reader",
          Policy: "{not json",
        }),
      );
    });

    // Then STS refuses it as malformed
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertIdentical(
      error.message,
      "The policy is not in the valid JSON format.",
    );
  });

  it("refuses an inline session policy that is JSON but not an object", async () => {
    // Given a Role its Account root may assume
    const { simAws, roleArn } = await assumableRole();

    // When the Role is assumed with a policy that is a bare string
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sts().assumeRole(
        new AssumeRoleCommand({
          RoleArn: roleArn,
          RoleSessionName: "reader",
          Policy: '"s3:*"',
        }),
      );
    });

    // Then STS refuses it as malformed
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
  });

  it("refuses more than ten managed session policies", async () => {
    // Given a Role its Account root may assume
    const { simAws, roleArn } = await assumableRole();
    const accountId = simAws.iam().accountId;

    // When the Role is assumed with eleven policy ARNs
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sts().assumeRole(
        new AssumeRoleCommand({
          RoleArn: roleArn,
          RoleSessionName: "reader",
          PolicyArns: Array.from({ length: 11 }, (_, index) => ({
            arn: `arn:aws:iam::${accountId}:policy/P${String(index)}`,
          })),
        }),
      );
    });

    // Then STS refuses the request
    assertInstanceOf(error, SimIamValidationError);
    assertStringEndsWith(
      error.message,
      "Member must have length less than or equal to 10",
    );
  });

  it("limits the AssumeRole call a session policy leaves out", async () => {
    // Given a read-only session, and a second Role its Account root may assume
    const { simAws, roleArn } = await assumableRole();
    const accountId = simAws.iam().accountId;
    const output = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: "reader",
        Policy: readOnly,
      }),
    );
    assertNonNullable(output.Credentials?.AccessKeyId);
    assertNonNullable(output.Credentials.SecretAccessKey);
    const identity = simAws.iam().credentials.resolveCredentials({
      accessKeyId: output.Credentials.AccessKeyId,
      secretAccessKey: output.Credentials.SecretAccessKey,
      sessionToken: output.Credentials.SessionToken,
    });
    await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "Next",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    // When the session assumes the second Role
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sts().assumeRole(
        new AssumeRoleCommand({
          RoleArn: `arn:aws:iam::${accountId}:role/Next`,
          RoleSessionName: "next",
        }),
        {
          caller: {
            kind: "resolved",
            principal: identity.principal,
            identityPolicyPrincipal: identity.identityPolicyPrincipal,
            sessionPolicies: identity.session?.sessionPolicies,
          },
        },
      );
    });

    // Then its session policy leaves it unable to
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
