import { CreateRoleCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimAws } from "../../aws/sim-aws.js";
import { SimIamInvalidCredentials } from "../../iam/credential/error/sim-iam-credential.error.js";
import type { SimAwsCredentials } from "../../iam/credential/sim-aws-credentials.js";

/**
 * Assume a Role its own Account root is allowed to assume, and return the
 * temporary credentials in the shape IAM authenticates.
 */
async function assumeRoleFor(
  simAws: SimAws,
  accountId: string,
  durationSeconds: number,
): Promise<SimAwsCredentials> {
  await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "TargetRole",
      AssumeRolePolicyDocument: JSON.stringify({
        Statement: {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  const output = await simAws.sts().assumeRole(
    new AssumeRoleCommand({
      RoleArn: `arn:aws:iam::${accountId}:role/TargetRole`,
      RoleSessionName: "clock-session",
      DurationSeconds: durationSeconds,
    }),
  );

  const credentials = output.Credentials;
  assertNonNullable(credentials);
  const accessKeyId = credentials.AccessKeyId;
  assertNonNullable(accessKeyId);
  const secretAccessKey = credentials.SecretAccessKey;
  assertNonNullable(secretAccessKey);
  const sessionToken = credentials.SessionToken;
  assertNonNullable(sessionToken);

  return { accessKeyId, secretAccessKey, sessionToken };
}

describe("STS AssumeRole session expiry in simulated time", () => {
  it("stops accepting temporary credentials once time is advanced past their expiry", async () => {
    // Given a fifteen minute assumed Role session that currently authenticates.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const credentials = await assumeRoleFor(simAws, accountId, 900);
    simAws.iam().credentials.resolveCredentials(credentials);

    // When twenty minutes of simulated time pass.
    await simAws.clock().advanceBy({ minutes: 20 });

    // Then the same credentials are rejected as an expired session, without the
    // test having waited twenty minutes or touched the host clock.
    const error = assertThrowsError(() =>
      simAws.iam().credentials.resolveCredentials(credentials),
    );
    assertInstanceOf(error, SimIamInvalidCredentials);
    assertIdentical(error.reason, "expired-session");
  });

  it("keeps accepting temporary credentials while advanced time is still inside the session", async () => {
    // Given a one hour assumed Role session.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const credentials = await assumeRoleFor(simAws, accountId, 3600);

    // When twenty minutes of simulated time pass.
    await simAws.clock().advanceBy({ minutes: 20 });

    // Then the credentials still authenticate: advancing expires a session on
    // the simulation's timeline, not on any other rule.
    const identity = simAws.iam().credentials.resolveCredentials(credentials);
    assertIdentical(identity.session?.sessionName, "clock-session");
  });
});
