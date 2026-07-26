import { describe, expect, it } from "vitest";

import { SimIamAccessKey } from "./sim-iam-access-key.js";
import { SimIamCredentialRegistry } from "./sim-iam-credential-registry.js";
import { SimIamSession } from "./session/sim-iam-session.js";
import { simIamRoleFactory } from "../role/sim-iam-role.factory.js";
import { SimFixedClock } from "../../../util/clock/sim-clock.js";

const creationDate = new Date("2026-07-26T09:00:00.000Z");
const expiration = new Date("2026-07-26T10:00:00.000Z");

/**
 * Register a temporary access key backed by a session that expires at a known
 * simulated time.
 */
function registerTemporaryKey(
  registry: SimIamCredentialRegistry,
): SimIamAccessKey {
  const principal = {
    kind: "arn" as const,
    arn: "arn:aws:sts::111111111111:assumed-role/Reporter/session",
  };
  const accessKey = new SimIamAccessKey({
    accessKeyId: "ASIAEXAMPLECLOCK0001",
    secretAccessKey: "secret",
    principal,
    creationDate,
    session: new SimIamSession({
      principal,
      sourcePrincipal: { kind: "arn", arn: "arn:aws:iam::111111111111:root" },
      role: simIamRoleFactory.make(),
      sessionName: "session",
      sessionToken: "token",
      creationDate,
      expiration,
    }),
  });

  registry.registerAccessKey(accessKey);

  return accessKey;
}

const credentials = {
  accessKeyId: "ASIAEXAMPLECLOCK0001",
  secretAccessKey: "secret",
  sessionToken: "token",
};

describe("SimIamCredentialRegistry session expiry", () => {
  it("accepts a session that has not expired in simulated time", () => {
    // Given a registry whose clock is stopped before the session expires
    const registry = new SimIamCredentialRegistry({
      clock: new SimFixedClock(new Date("2026-07-26T09:30:00.000Z")),
    });
    registerTemporaryKey(registry);

    // When the credentials are resolved
    const identity = registry.resolveCredentials(credentials);

    // Then they authenticate
    expect(identity.principal).toStrictEqual({
      kind: "arn",
      arn: "arn:aws:sts::111111111111:assumed-role/Reporter/session",
    });
  });

  it("rejects a session that has expired in simulated time", () => {
    // Given a registry whose clock is stopped after the session expires
    const registry = new SimIamCredentialRegistry({
      clock: new SimFixedClock(new Date("2026-07-26T11:00:00.000Z")),
    });
    registerTemporaryKey(registry);

    // When the credentials are resolved
    // Then expiry is judged against simulated time, not the host clock
    expect(() => registry.resolveCredentials(credentials)).toThrow(/expired/i);
  });
});
