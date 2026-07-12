import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { IamRoleArnParser } from "./sim-iam-role-arn-parser.js";

describe("IamRoleArnParser", () => {
  it("parses a role ARN without a path", () => {
    // Given a valid IAM role ARN without a role path.
    const parser = new IamRoleArnParser();

    // When the role ARN is parsed.
    const parts = parser.parse(
      "arn:aws:iam::123456789012:role/ApplicationRole",
    );

    // Then the account ID and role name are returned.
    assertIdentical(parts.accountId, "123456789012");
    assertIdentical(parts.roleName, "ApplicationRole");
  });

  it("parses the role name from the end of a nested path", () => {
    // Given a valid IAM role ARN with a nested role path.
    const parser = new IamRoleArnParser();

    // When the role ARN is parsed.
    const parts = parser.parse(
      "arn:aws:iam::123456789012:role/application/production/ApplicationRole",
    );

    // Then only the final path component is returned as the role name.
    assertIdentical(parts.accountId, "123456789012");
    assertIdentical(parts.roleName, "ApplicationRole");
  });

  it("accepts an account ID at the numeric boundaries", () => {
    // Given a valid role ARN whose account ID contains zero and nine.
    const parser = new IamRoleArnParser();

    // When the role ARN is parsed.
    const parts = parser.parse("arn:aws:iam::090909090909:role/TestRole");

    // Then the numeric account ID is accepted.
    assertIdentical(parts.accountId, "090909090909");
  });

  it("rejects an ARN with the wrong partition", () => {
    // Given a role ARN using a partition outside the supported prefix.
    const parser = new IamRoleArnParser();
    const roleArn = "arn:aws-us-gov:iam::123456789012:role/TestRole";

    // When the role ARN is parsed.
    const error = assertThrowsError(() => {
      parser.parse(roleArn);
    });

    // Then the complete invalid ARN is identified.
    assertStringIncludes(error.message, `Invalid IAM Role ARN: ${roleArn}`);
  });

  it("rejects an ARN for a different IAM resource type", () => {
    // Given a validly prefixed IAM ARN that does not identify a role.
    const parser = new IamRoleArnParser();
    const roleArn = "arn:aws:iam::123456789012:user/TestUser";

    // When the ARN is parsed as a role.
    const error = assertThrowsError(() => {
      parser.parse(roleArn);
    });

    // Then it is rejected as an invalid role ARN.
    assertStringIncludes(error.message, `Invalid IAM Role ARN: ${roleArn}`);
  });

  it("rejects an account ID shorter than twelve characters", () => {
    // Given a role ARN whose account ID is too short.
    const parser = new IamRoleArnParser();
    const roleArn = "arn:aws:iam::12345678901:role/TestRole";

    // When the role ARN is parsed.
    const error = assertThrowsError(() => {
      parser.parse(roleArn);
    });

    // Then the invalid account ID is rejected.
    assertStringIncludes(error.message, `Invalid IAM Role ARN: ${roleArn}`);
  });

  it("rejects an account ID longer than twelve characters", () => {
    // Given a role ARN whose account ID is too long.
    const parser = new IamRoleArnParser();
    const roleArn = "arn:aws:iam::1234567890123:role/TestRole";

    // When the role ARN is parsed.
    const error = assertThrowsError(() => {
      parser.parse(roleArn);
    });

    // Then the invalid account ID is rejected.
    assertStringIncludes(error.message, `Invalid IAM Role ARN: ${roleArn}`);
  });

  it("rejects an account ID containing a character below the digit range", () => {
    // Given a twelve-character account ID containing punctuation before zero.
    const parser = new IamRoleArnParser();
    const roleArn = "arn:aws:iam::12345/789012:role/TestRole";

    // When the role ARN is parsed.
    const error = assertThrowsError(() => {
      parser.parse(roleArn);
    });

    // Then the non-numeric account ID is rejected.
    assertStringIncludes(error.message, `Invalid IAM Role ARN: ${roleArn}`);
  });

  it("rejects an account ID containing a character above the digit range", () => {
    // Given a twelve-character account ID containing a letter after nine.
    const parser = new IamRoleArnParser();
    const roleArn = "arn:aws:iam::12345A789012:role/TestRole";

    // When the role ARN is parsed.
    const error = assertThrowsError(() => {
      parser.parse(roleArn);
    });

    // Then the non-numeric account ID is rejected.
    assertStringIncludes(error.message, `Invalid IAM Role ARN: ${roleArn}`);
  });

  it("rejects an empty account ID", () => {
    // Given a role ARN with no account ID.
    const parser = new IamRoleArnParser();
    const roleArn = "arn:aws:iam:::role/TestRole";

    // When the role ARN is parsed.
    const error = assertThrowsError(() => {
      parser.parse(roleArn);
    });

    // Then the missing account ID is rejected.
    assertStringIncludes(error.message, `Invalid IAM Role ARN: ${roleArn}`);
  });

  it("rejects an empty role name", () => {
    // Given a role ARN with nothing after the role separator.
    const parser = new IamRoleArnParser();
    const roleArn = "arn:aws:iam::123456789012:role/";

    // When the role ARN is parsed.
    const error = assertThrowsError(() => {
      parser.parse(roleArn);
    });

    // Then the missing role name is rejected.
    assertStringIncludes(error.message, `Invalid IAM Role ARN: ${roleArn}`);
  });

  it("rejects a role path ending with a slash", () => {
    // Given a role ARN whose path has no final role name.
    const parser = new IamRoleArnParser();
    const roleArn = "arn:aws:iam::123456789012:role/application/";

    // When the role ARN is parsed.
    const error = assertThrowsError(() => {
      parser.parse(roleArn);
    });

    // Then the missing final role name is rejected.
    assertStringIncludes(error.message, `Invalid IAM Role ARN: ${roleArn}`);
  });
});
