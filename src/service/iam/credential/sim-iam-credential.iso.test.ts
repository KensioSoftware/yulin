import {
  assertIdentical,
  assertInstanceOf,
  assertObjectHasProperty,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimIamRole } from "../role/sim-iam-role.js";
import { SimIamAccessKey } from "./sim-iam-access-key.js";
import {
  SimIamDuplicateAccessKey,
  SimIamInvalidCredentials,
} from "./error/sim-iam-credential.error.js";
import { SimIamCredentialRegistry } from "./sim-iam-credential-registry.js";
import { SimIamSession } from "./session/sim-iam-session.js";

describe("SimIamCredentialRegistry", () => {
  it("resolves the identity for valid long-lived credentials", () => {
    // Given an active long-lived access key registered for a principal.
    const registry = new SimIamCredentialRegistry();
    registry.registerAccessKey(
      new SimIamAccessKey({
        accessKeyId: "AKIAEXAMPLE",
        secretAccessKey: "correct-secret",
        principal: {
          kind: "arn",
          arn: "arn:aws:iam::123456789012:user/TestUser",
        },
      }),
    );

    // When matching credentials are resolved.
    const identity = registry.resolve({
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "correct-secret",
    });

    // Then the registered principal is authenticated.
    assertObjectHasProperty(identity.principal, "arn");
    assertIdentical(
      identity.principal.arn,
      "arn:aws:iam::123456789012:user/TestUser",
    );
    assertUndefined(identity.session);
  });

  it("resolves the identity for valid temporary credentials", () => {
    // Given an active access key backed by an unexpired session.
    const registry = new SimIamCredentialRegistry();
    const session = new SimIamSession({
      principal: {
        kind: "arn",
        arn: "arn:aws:sts::123456789012:assumed-role/TestRole/test-session",
      },
      sourcePrincipal: {
        kind: "arn",
        arn: "arn:aws:iam::123456789012:user/TestUser",
      },
      role: {} as SimIamRole,
      sessionName: "test-session",
      sessionToken: "correct-token",
      createDate: new Date("2026-01-01T00:00:00.000Z"),
      expiration: new Date("2026-01-01T01:00:00.000Z"),
    });
    registry.registerAccessKey(
      new SimIamAccessKey({
        accessKeyId: "ASIATEMPORARY",
        secretAccessKey: "correct-secret",
        principal: session.principal,
        session,
      }),
    );

    // When all temporary credential components match before expiration.
    const identity = registry.resolve(
      {
        accessKeyId: "ASIATEMPORARY",
        secretAccessKey: "correct-secret",
        sessionToken: "correct-token",
      },
      new Date("2026-01-01T00:59:59.999Z"),
    );

    // Then the session identity is authenticated.
    assertIdentical(identity.session, session);
  });

  it("rejects an unknown access key", () => {
    // Given no access key is registered for the supplied ID.
    const registry = new SimIamCredentialRegistry();

    // When credentials using that ID are resolved.
    const error = assertThrowsError(() => {
      registry.resolve({
        accessKeyId: "AKIAUNKNOWN",
        secretAccessKey: "secret",
      });
    });

    // Then an unknown-access-key credential error is raised.
    assertInstanceOf(error, SimIamInvalidCredentials);
    assertIdentical(error.reason, "unknown-access-key");
  });

  it("rejects an inactive access key before checking its secret", () => {
    // Given an inactive access key is registered.
    const registry = new SimIamCredentialRegistry();
    registry.registerAccessKey(
      new SimIamAccessKey({
        accessKeyId: "AKIAINACTIVE",
        secretAccessKey: "correct-secret",
        principal: {
          kind: "arn",
          arn: "arn:aws:iam::123456789012:user/TestUser",
        },
        status: "Inactive",
      }),
    );

    // When credentials with a mismatched secret are resolved.
    const error = assertThrowsError(() => {
      registry.resolve({
        accessKeyId: "AKIAINACTIVE",
        secretAccessKey: "wrong-secret",
      });
    });

    // Then the inactive status is reported as the first failure.
    assertInstanceOf(error, SimIamInvalidCredentials);
    assertIdentical(error.reason, "inactive-access-key");
    assertIdentical(error.accessKeyStatus, "Inactive");
  });

  it("rejects a mismatched secret access key", () => {
    // Given an active long-lived access key is registered.
    const registry = new SimIamCredentialRegistry();
    registry.registerAccessKey(
      new SimIamAccessKey({
        accessKeyId: "AKIAEXAMPLE",
        secretAccessKey: "correct-secret",
        principal: {
          kind: "arn",
          arn: "arn:aws:iam::123456789012:user/TestUser",
        },
      }),
    );

    // When credentials supply the wrong secret.
    const error = assertThrowsError(() => {
      registry.resolve({
        accessKeyId: "AKIAEXAMPLE",
        secretAccessKey: "wrong-secret",
      });
    });

    // Then a secret mismatch is reported without exposing either secret.
    assertInstanceOf(error, SimIamInvalidCredentials);
    assertIdentical(error.reason, "secret-access-key-mismatch");
  });

  it("rejects temporary credentials without a session token", () => {
    // Given an access key backed by a temporary session.
    const registry = new SimIamCredentialRegistry();
    const createDate = new Date("2026-01-01T00:00:00.000Z");
    const expiration = new Date("2026-01-01T01:00:00.000Z");
    registry.registerAccessKey(
      new SimIamAccessKey({
        accessKeyId: "ASIATEMPORARY",
        secretAccessKey: "correct-secret",
        principal: {
          kind: "arn",
          arn: "arn:aws:sts::123456789012:assumed-role/TestRole/test-session",
        },
        session: new SimIamSession({
          principal: {
            kind: "arn",
            arn: "arn:aws:sts::123456789012:assumed-role/TestRole/test-session",
          },
          sourcePrincipal: {
            kind: "arn",
            arn: "arn:aws:iam::123456789012:user/TestUser",
          },
          role: {} as SimIamRole,
          sessionName: "test-session",
          sessionToken: "correct-token",
          createDate,
          expiration,
        }),
      }),
    );

    // When the session token is omitted.
    const error = assertThrowsError(() => {
      registry.resolve({
        accessKeyId: "ASIATEMPORARY",
        secretAccessKey: "correct-secret",
      });
    });

    // Then the missing session token is reported.
    assertInstanceOf(error, SimIamInvalidCredentials);
    assertIdentical(error.reason, "session-token-missing");
  });

  it("rejects a session token supplied for a long-lived access key", () => {
    // Given a registered access key has no temporary session.
    const registry = new SimIamCredentialRegistry();
    registry.registerAccessKey(
      new SimIamAccessKey({
        accessKeyId: "AKIAEXAMPLE",
        secretAccessKey: "correct-secret",
        principal: {
          kind: "arn",
          arn: "arn:aws:iam::123456789012:user/TestUser",
        },
      }),
    );

    // When credentials include an unexpected session token.
    const error = assertThrowsError(() => {
      registry.resolve({
        accessKeyId: "AKIAEXAMPLE",
        secretAccessKey: "correct-secret",
        sessionToken: "unexpected-token",
      });
    });

    // Then the unexpected session token is reported.
    assertInstanceOf(error, SimIamInvalidCredentials);
    assertIdentical(error.reason, "session-token-unexpected");
  });

  it("rejects a mismatched session token", () => {
    // Given an access key backed by a temporary session.
    const registry = new SimIamCredentialRegistry();
    const createDate = new Date("2026-01-01T00:00:00.000Z");
    const expiration = new Date("2026-01-01T01:00:00.000Z");
    registry.registerAccessKey(
      new SimIamAccessKey({
        accessKeyId: "ASIATEMPORARY",
        secretAccessKey: "correct-secret",
        principal: {
          kind: "arn",
          arn: "arn:aws:sts::123456789012:assumed-role/TestRole/test-session",
        },
        session: new SimIamSession({
          principal: {
            kind: "arn",
            arn: "arn:aws:sts::123456789012:assumed-role/TestRole/test-session",
          },
          sourcePrincipal: {
            kind: "arn",
            arn: "arn:aws:iam::123456789012:user/TestUser",
          },
          role: {} as SimIamRole,
          sessionName: "test-session",
          sessionToken: "correct-token",
          createDate,
          expiration,
        }),
      }),
    );

    // When credentials supply a different session token.
    const error = assertThrowsError(() => {
      registry.resolve(
        {
          accessKeyId: "ASIATEMPORARY",
          secretAccessKey: "correct-secret",
          sessionToken: "wrong-token",
        },
        new Date("2026-01-01T00:30:00.000Z"),
      );
    });

    // Then the session token mismatch is reported.
    assertInstanceOf(error, SimIamInvalidCredentials);
    assertIdentical(error.reason, "session-token-mismatch");
  });

  it("rejects a session at its expiration time", () => {
    // Given temporary credentials whose session expires at a known instant.
    const registry = new SimIamCredentialRegistry();
    const createDate = new Date("2026-01-01T00:00:00.000Z");
    const expiration = new Date("2026-01-01T01:00:00.000Z");
    registry.registerAccessKey(
      new SimIamAccessKey({
        accessKeyId: "ASIATEMPORARY",
        secretAccessKey: "correct-secret",
        principal: {
          kind: "arn",
          arn: "arn:aws:sts::123456789012:assumed-role/TestRole/test-session",
        },
        session: new SimIamSession({
          principal: {
            kind: "arn",
            arn: "arn:aws:sts::123456789012:assumed-role/TestRole/test-session",
          },
          sourcePrincipal: {
            kind: "arn",
            arn: "arn:aws:iam::123456789012:user/TestUser",
          },
          role: {} as SimIamRole,
          sessionName: "test-session",
          sessionToken: "correct-token",
          createDate,
          expiration,
        }),
      }),
    );

    // When the credentials are resolved exactly at expiration.
    const error = assertThrowsError(() => {
      registry.resolve(
        {
          accessKeyId: "ASIATEMPORARY",
          secretAccessKey: "correct-secret",
          sessionToken: "correct-token",
        },
        new Date("2026-01-01T01:00:00.000Z"),
      );
    });

    // Then the session is rejected as expired.
    assertInstanceOf(error, SimIamInvalidCredentials);
    assertIdentical(error.reason, "expired-session");
    assertIdentical(
      error.expiration?.toISOString(),
      "2026-01-01T01:00:00.000Z",
    );
  });

  it("rejects a duplicate access key ID", () => {
    // Given an access key ID is already registered.
    const registry = new SimIamCredentialRegistry();
    registry.registerAccessKey(
      new SimIamAccessKey({
        accessKeyId: "AKIADUPLICATE",
        secretAccessKey: "first-secret",
        principal: {
          kind: "arn",
          arn: "arn:aws:iam::123456789012:user/FirstUser",
        },
      }),
    );

    // When another access key with the same ID is registered.
    const error = assertThrowsError(() => {
      registry.registerAccessKey(
        new SimIamAccessKey({
          accessKeyId: "AKIADUPLICATE",
          secretAccessKey: "second-secret",
          principal: {
            kind: "arn",
            arn: "arn:aws:iam::123456789012:user/SecondUser",
          },
        }),
      );
    });

    // Then a duplicate access key error identifies the conflicting ID.
    assertInstanceOf(error, SimIamDuplicateAccessKey);
    assertStringIncludes(error.message, "AKIADUPLICATE");
  });
});
