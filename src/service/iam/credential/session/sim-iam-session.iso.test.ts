import { assertIdentical, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";
import { simIamRoleFactory } from "../../role/sim-iam-role.factory.js";
import { SimIamSession } from "./sim-iam-session.js";

describe("SimIamSession", () => {
  const validProps = () => ({
    principal: {
      kind: "arn" as const,
      arn: "arn:aws:sts::123456789012:assumed-role/ApplicationRole/test-session",
    },
    sourcePrincipal: {
      kind: "arn" as const,
      arn: "arn:aws:iam::123456789012:role/SourceRole",
    },
    role: simIamRoleFactory.make(),
    sessionName: "test-session",
    sessionToken: "test-session-token",
    createDate: new Date("2026-01-01T00:00:00.000Z"),
    expiration: new Date("2026-01-01T01:00:00.000Z"),
  });

  it("rejects an empty session name", () => {
    const error = assertThrowsError(
      () =>
        new SimIamSession({
          ...validProps(),
          sessionName: "",
        }),
    );

    assertIdentical(error.message, "Sim IAM session name must not be empty");
  });

  it("rejects an empty session token", () => {
    const error = assertThrowsError(
      () =>
        new SimIamSession({
          ...validProps(),
          sessionToken: "",
        }),
    );

    assertIdentical(error.message, "Sim IAM session token must not be empty");
  });

  it.each([
    {
      name: "equal to its creation time",
      expiration: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      name: "before its creation time",
      expiration: new Date("2025-12-31T23:59:59.999Z"),
    },
  ])("rejects an expiration $name", ({ expiration }) => {
    const error = assertThrowsError(
      () =>
        new SimIamSession({
          ...validProps(),
          expiration,
        }),
    );

    assertIdentical(
      error.message,
      "Sim IAM session expiration must follow its creation",
    );
  });
});
