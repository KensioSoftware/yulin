import {
  CreateRoleCommand,
  GetRoleCommand,
  PutRolePolicyCommand,
} from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { SimIamValidationError } from "../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";

/**
 * A simulation holding a Role its Account root may assume, and that trusts
 * sessions of itself.
 */
async function assumableRole(maxSessionDuration?: number): Promise<{
  readonly simAws: SimAws;
  readonly roleArn: string;
}> {
  const simAws = new SimAws({ defaultAccountId: makeSimAwsAccountId() });
  const accountId = simAws.iam().accountId;
  await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "Batch",
      MaxSessionDuration: maxSessionDuration,
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  return { simAws, roleArn: `arn:aws:iam::${accountId}:role/Batch` };
}

/**
 * The error an AssumeRole request is refused with.
 */
async function refusal(
  simAws: SimAws,
  input: ConstructorParameters<typeof AssumeRoleCommand>[0],
  caller?: SimAwsCaller,
): Promise<Error> {
  return await assertThrowsErrorAsync(async () => {
    await simAws
      .sts()
      .assumeRole(
        new AssumeRoleCommand(input),
        caller === undefined ? undefined : { caller },
      );
  });
}

describe("STS AssumeRole session duration", () => {
  it("refuses a session shorter than 15 minutes", async () => {
    // Given a Role its Account root may assume
    const { simAws, roleArn } = await assumableRole();

    // When it is assumed for ten minutes
    const error = await refusal(simAws, {
      RoleArn: roleArn,
      RoleSessionName: "batch",
      DurationSeconds: 600,
    });

    // Then STS refuses the duration
    assertInstanceOf(error, SimIamValidationError);
    assertIdentical(
      error.message,
      "1 validation error detected: Value '600' at 'durationSeconds' failed " +
        "to satisfy constraint: Member must have value greater than or equal to 900",
    );
  });

  it("refuses a session longer than 12 hours", async () => {
    // Given a Role allowing the longest sessions
    const { simAws, roleArn } = await assumableRole(43_200);

    // When it is assumed for longer than that
    const error = await refusal(simAws, {
      RoleArn: roleArn,
      RoleSessionName: "batch",
      DurationSeconds: 43_201,
    });

    // Then STS refuses the duration
    assertInstanceOf(error, SimIamValidationError);
  });

  it("refuses a session longer than the Role's MaxSessionDuration", async () => {
    // Given a Role left at the one-hour default
    const { simAws, roleArn } = await assumableRole();

    // When it is assumed for two hours
    const error = await refusal(simAws, {
      RoleArn: roleArn,
      RoleSessionName: "batch",
      DurationSeconds: 7200,
    });

    // Then the Role's maximum refuses it
    assertInstanceOf(error, SimIamValidationError);
    assertIdentical(
      error.message,
      "The requested DurationSeconds exceeds the MaxSessionDuration set for this role.",
    );
  });

  it("issues a session as long as the Role allows", async () => {
    // Given a Role allowing four-hour sessions
    const { simAws, roleArn } = await assumableRole(14_400);

    // When it is assumed for four hours
    const output = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: "batch",
        DurationSeconds: 14_400,
      }),
    );

    // Then the session lasts four hours
    assertNonNullable(output.Credentials?.Expiration);
    const role = await simAws
      .iam()
      .getRole(new GetRoleCommand({ RoleName: "Batch" }));
    assertIdentical(role.Role.MaxSessionDuration, 14_400);
  });

  it("caps a role chain at one hour", async () => {
    // Given a Role allowing four-hour sessions and allowed to assume itself,
    // and a session of that Role
    const { simAws, roleArn } = await assumableRole(14_400);
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Batch",
        PolicyName: "chain",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "sts:AssumeRole", Resource: roleArn },
        }),
      }),
    );
    const caller: SimAwsCaller = {
      kind: "resolved",
      principal: {
        kind: "arn",
        arn: `arn:aws:sts::${simAws.iam().accountId}:assumed-role/Batch/first`,
      },
      identityPolicyPrincipal: { kind: "arn", arn: roleArn },
    };

    // When the session assumes the Role again for two hours
    const error = await refusal(
      simAws,
      { RoleArn: roleArn, RoleSessionName: "second", DurationSeconds: 7200 },
      caller,
    );

    // Then the role-chaining cap refuses it
    assertInstanceOf(error, SimIamValidationError);
    assertIdentical(
      error.message,
      "The requested DurationSeconds exceeds the 1 hour session limit for " +
        "roles assumed by role chaining.",
    );
  });
});

describe("STS AssumeRole request members", () => {
  it("refuses a session name with a character STS rejects", async () => {
    // Given a Role its Account root may assume
    const { simAws, roleArn } = await assumableRole();

    // When it is assumed with a space in the session name
    const error = await refusal(simAws, {
      RoleArn: roleArn,
      RoleSessionName: "nightly batch",
    });

    // Then STS names the pattern the name breaks
    assertInstanceOf(error, SimIamValidationError);
    assertIdentical(
      error.message,
      String.raw`1 validation error detected: Value 'nightly batch' at 'roleSessionName' failed to satisfy constraint: Member must satisfy regular expression pattern: [\w+=,.@-]*`,
    );
  });

  it("refuses a session name shorter or longer than STS allows", async () => {
    // Given a Role its Account root may assume
    const { simAws, roleArn } = await assumableRole();

    // When it is assumed with a one-character name and a 65-character one
    const short = await refusal(simAws, {
      RoleArn: roleArn,
      RoleSessionName: "b",
    });
    const long = await refusal(simAws, {
      RoleArn: roleArn,
      RoleSessionName: "b".repeat(65),
    });

    // Then STS refuses both
    assertInstanceOf(short, SimIamValidationError);
    assertInstanceOf(long, SimIamValidationError);
  });

  it("refuses an external ID with a character STS rejects", async () => {
    // Given a Role its Account root may assume
    const { simAws, roleArn } = await assumableRole();

    // When it is assumed with a space in the external ID
    const error = await refusal(simAws, {
      RoleArn: roleArn,
      RoleSessionName: "batch",
      ExternalId: "partner id",
    });

    // Then STS refuses it
    assertInstanceOf(error, SimIamValidationError);
  });
});

describe("IAM Role MaxSessionDuration", () => {
  it("reports one hour for a Role created without one", async () => {
    // Given a Role created without a MaxSessionDuration
    const { simAws } = await assumableRole();

    // When the Role is read
    const role = await simAws
      .iam()
      .getRole(new GetRoleCommand({ RoleName: "Batch" }));

    // Then it reports IAM's default
    assertIdentical(role.Role.MaxSessionDuration, 3600);
  });

  it("refuses a MaxSessionDuration outside one to twelve hours", async () => {
    // Given an Account
    const simIam = new SimAws().account(makeSimAwsAccountId()).iam();
    const create = (seconds: number) =>
      assertThrowsErrorAsync(async () => {
        await simIam.createRole(
          new CreateRoleCommand({
            RoleName: `Batch${String(seconds)}`,
            MaxSessionDuration: seconds,
            AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
              Statement: {
                Principal: { Service: "batch.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            }),
          }),
        );
      });

    // When Roles are created allowing 30 minutes and 13 hours
    const short = await create(1800);
    const long = await create(46_800);
    const fractional = await create(7200.5);

    // Then IAM refuses both, and a duration that is not a whole number
    assertInstanceOf(short, SimIamValidationError);
    assertIdentical(
      short.message,
      "1 validation error detected: Value '1800' at 'maxSessionDuration' " +
        "failed to satisfy constraint: Member must have value greater than or equal to 3600",
    );
    assertInstanceOf(long, SimIamValidationError);
    assertInstanceOf(fractional, SimIamValidationError);
  });
});
