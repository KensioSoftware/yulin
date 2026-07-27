import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimIamPresignedRequestExpired } from "../error/sim-iam-sigv4.error.js";
import { SimIamSigV4PresignedQuery } from "./sim-iam-sigv4-presigned-query.js";
import { presignedTestUrl } from "../../../../../test/sigv4/presigned-test-url.js";

describe("The window a presigned URL was signed for", () => {
  it("is usable up to the moment it expires", () => {
    // Given a URL signed at noon for fifteen minutes
    const presigned = SimIamSigV4PresignedQuery.parse(presignedTestUrl());

    // Then the last instant of the window is still inside it
    presigned.checkNotExpired(new Date("2026-07-27T12:15:00.000Z"));
    expect(() => {
      presigned.checkNotExpired(new Date("2026-07-27T12:15:00.001Z"));
    }).toThrow(SimIamPresignedRequestExpired);
  });

  it("says when it was signed and when it expired", () => {
    // Given an expired URL
    const presigned = SimIamSigV4PresignedQuery.parse(presignedTestUrl());

    // Then the refusal carries the AWS message and the instants either side of
    // it, because the useful question is by how much it was missed
    const error = assertThrowsError(() => {
      presigned.checkNotExpired(new Date("2026-07-27T13:00:00.000Z"));
    });
    assertInstanceOf(error, SimIamPresignedRequestExpired);
    assertIdentical(error.code, "AccessDenied");
    expect(error.message).toMatch(/Request has expired/);
    expect(error.message).toMatch(/2026-07-27T12:15:00.000Z/);
  });
});
