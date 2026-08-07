import { CreateRoleCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import { describe, expect, it } from "vitest";

import { signAwsRequest } from "../../../../test/sigv4/sign-aws-request.js";
import type { SimClock } from "../../../util/clock/sim-clock.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessKey } from "../credential/sim-iam-access-key.js";
import { SimIamAccountSigningCredentials } from "../credential/sim-iam-account-signing-credentials.js";
import { SimIamCredentialRegistry } from "../credential/sim-iam-credential-registry.js";
import {
  SimIamExpiredToken,
  SimIamInvalidClientTokenId,
} from "./error/sim-iam-sigv4.error.js";
import { simIamSigV4SignedRequest } from "./sim-iam-sigv4-signed-request.js";
import { SimIamSigV4Verifier } from "./sim-iam-sigv4-verifier.js";
import {
  deactivatedAccessKeyId,
  signerEndpoint,
  simulationWithSigner,
  unknownAccessKeyId,
} from "../../../../test/sigv4/sim-signer.js";

/**
 * A clock a test can move forward, standing in for the time control that a
 * simulation will grow its own API for.
 */
class MovableClock implements SimClock {
  #instant: Date;

  constructor(instant: Date) {
    this.#instant = instant;
  }

  now(): Date {
    return this.#instant;
  }

  moveTo(instant: Date): void {
    this.#instant = instant;
  }
}

const accountId = "111111111111";
const roleArn = `arn:aws:iam::${accountId}:role/Deployer`;

/**
 * Assume a role and return credentials that can sign for its session.
 */
async function assumeRole(simAws: SimAws): Promise<{
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
}> {
  const account = simAws.account(accountId);

  await account.iam().createRole(
    new CreateRoleCommand({
      RoleName: "Deployer",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  const assumed = await account.sts().assumeRole(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: "deploy-session",
      DurationSeconds: 900,
    }),
  );

  const credentials = assumed.Credentials;

  assertDefined(
    credentials,
    "Expected simulated STS to return session credentials",
  );
  assertDefined(
    credentials.SessionToken,
    "Expected simulated STS to return a session token",
  );

  return {
    accessKeyId: credentials.AccessKeyId ?? "",
    secretAccessKey: credentials.SecretAccessKey ?? "",
    sessionToken: credentials.SessionToken,
  };
}

describe("SigV4 signing credentials", () => {
  it("rejects a signature from an access key no account issued", async () => {
    // Given a request signed with credentials the simulation never issued
    const { simAws } = await simulationWithSigner();
    const signed = await signAwsRequest({
      url: signerEndpoint,
      credentials: {
        accessKeyId: unknownAccessKeyId,
        secretAccessKey: "invented-secret",
      },
    });

    // When the simulator verifies it
    // Then the access key is what is rejected, before any signature check
    expect(() => simAws.verifySignedRequest(signed.request)).toThrow(
      SimIamInvalidClientTokenId,
    );
  });

  it("rejects a signature from a deactivated access key", async () => {
    // Given an access key that has been deactivated
    const credentials = {
      accessKeyId: deactivatedAccessKeyId,
      secretAccessKey: "still-known-secret",
    };
    const registry = new SimIamCredentialRegistry();
    registry.registerAccessKey(
      new SimIamAccessKey({
        ...credentials,
        principal: { kind: "arn", arn: `arn:aws:iam::${accountId}:user/Old` },
        creationDate: new Date("2026-07-26T09:00:00.000Z"),
        status: "Inactive",
      }),
    );
    const verifier = new SimIamSigV4Verifier({
      credentials: new SimIamAccountSigningCredentials(registry),
    });
    const signed = await signAwsRequest({ url: signerEndpoint, credentials });

    // When a correctly signed request from it is verified
    // Then it is refused: the signature is sound but the key is not usable
    expect(() =>
      verifier.verify(simIamSigV4SignedRequest(signed.request)),
    ).toThrow(SimIamInvalidClientTokenId);
  });

  it("resolves the assumed role session behind temporary credentials", async () => {
    // Given temporary credentials from simulated STS
    const simAws = new SimAws();
    const credentials = await assumeRole(simAws);

    // When a request signed with them, session token and all, is verified
    const signed = await signAwsRequest({ url: signerEndpoint, credentials });
    const identity = simAws.verifySignedRequest(signed.request);

    // Then the request is attributed to the assumed role session, while the
    // Role itself is what carries the identity policies
    expect(identity.principal).toStrictEqual({
      kind: "arn",
      arn: `arn:aws:sts::${accountId}:assumed-role/Deployer/deploy-session`,
    });
    expect(identity.identityPolicyPrincipal).toStrictEqual({
      kind: "arn",
      arn: roleArn,
    });
  });

  it("rejects temporary credentials whose session has expired", async () => {
    // Given temporary credentials valid for fifteen minutes
    const clock = new MovableClock(new Date("2026-07-26T09:00:00.000Z"));
    const simAws = new SimAws({ clock });
    const credentials = await assumeRole(simAws);
    const signed = await signAwsRequest({ url: signerEndpoint, credentials });

    // When simulated time moves past the session's expiry
    clock.moveTo(new Date("2026-07-26T10:00:00.000Z"));

    // Then the same signature is no longer accepted, because credential
    // expiry is judged in simulated time even though signature age is not
    expect(() => simAws.verifySignedRequest(signed.request)).toThrow(
      SimIamExpiredToken,
    );
  });

  it("rejects a long-lived key presented with a session token", async () => {
    // Given a long-lived access key signed with a session token it has none of
    const { simAws, credentials } = await simulationWithSigner();
    const signed = await signAwsRequest({
      url: signerEndpoint,
      credentials: { ...credentials, sessionToken: "not-a-real-session" },
    });

    // When the simulator verifies it
    // Then the mismatch between key and token is what is reported
    expect(() => simAws.verifySignedRequest(signed.request)).toThrow(
      SimIamInvalidClientTokenId,
    );
  });

  it("rejects temporary credentials presented with the wrong session token", async () => {
    // Given temporary credentials signed with someone else's session token
    const simAws = new SimAws();
    const credentials = await assumeRole(simAws);
    const signed = await signAwsRequest({
      url: signerEndpoint,
      credentials: { ...credentials, sessionToken: "another-session-token" },
    });

    // When the simulator verifies it
    // Then the session token is rejected
    expect(() => simAws.verifySignedRequest(signed.request)).toThrow(
      SimIamInvalidClientTokenId,
    );
  });
});
