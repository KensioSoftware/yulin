import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimIamMalformedPolicyDocument } from "../error/sim-iam.error.js";
import type { SimIamPolicyDocument } from "../policy/sim-iam-policy.js";
import { SimIamPolicyDocumentValidator } from "./sim-iam-policy-doc-validator.js";

describe("SimIamPolicyDocumentValidator", () => {
  it("accepts a valid single-statement Allow policy document", () => {
    // Given a well-formed IAM policy document with a single Allow statement.
    const validator: SimIamPolicyDocumentValidator =
      new SimIamPolicyDocumentValidator();
    const policyDocument = JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::example-bucket/*",
      },
    } satisfies SimIamPolicyDocument);

    // When the required policy document is validated.
    validator.validateRequired(policyDocument);

    // Then no validation error is thrown.
  });

  it("accepts valid statement arrays using NotAction and NotResource", () => {
    // Given a well-formed IAM policy document using the NotAction and NotResource alternatives.
    const validator: SimIamPolicyDocumentValidator =
      new SimIamPolicyDocumentValidator();
    const policyDocument = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Deny",
          NotAction: "s3:GetObject",
          NotResource: "arn:aws:s3:::example-bucket/public/*",
        },
      ],
    } satisfies SimIamPolicyDocument);

    // When the required policy document is validated.
    validator.validateRequired(policyDocument);

    // Then no validation error is thrown.
  });

  it("allows missing optional policy documents", () => {
    // Given an optional IAM policy document is absent.
    const validator: SimIamPolicyDocumentValidator =
      new SimIamPolicyDocumentValidator();

    // When the optional policy document is validated.
    validator.validateOptional(undefined);

    // Then no validation error is thrown.
  });

  it("rejects missing required policy documents", () => {
    // Given a required IAM policy document is absent.
    const validator: SimIamPolicyDocumentValidator =
      new SimIamPolicyDocumentValidator();

    // When the required policy document is validated.
    const error = assertThrowsError(() => {
      validator.validateRequired(undefined);
    });

    // Then a required-field error is thrown.
    assertInstanceOf(error, Error);
    assertStringIncludes(error.message, "PolicyDocument is required");
  });

  it("rejects policy documents without Statement", () => {
    // Given an IAM policy document does not define Statement.
    const validator: SimIamPolicyDocumentValidator =
      new SimIamPolicyDocumentValidator();
    const policyDocument = JSON.stringify({
      Version: "2012-10-17",
    } satisfies SimIamPolicyDocument);

    // When the policy document is validated.
    const error = assertThrowsError(() => {
      validator.validateRequired(policyDocument);
    });

    // Then the malformed document error explains that Statement is required.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertStringIncludes(
      error.message,
      "IAM policy document must define Statement",
    );
  });

  it("rejects statements without Effect", () => {
    // Given an IAM policy statement is missing Effect at runtime.
    const validator: SimIamPolicyDocumentValidator =
      new SimIamPolicyDocumentValidator();
    const policyDocument = JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::example-bucket/*",
      },
    });

    // When the policy document is validated.
    const error = assertThrowsError(() => {
      validator.validateRequired(policyDocument);
    });

    // Then the malformed document error explains that Effect must be valid.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertStringIncludes(
      error.message,
      'IAM policy statement Effect must be either "Allow" or "Deny"',
    );
  });

  it("rejects statements with invalid Effect values", () => {
    // Given an IAM policy statement has an unsupported Effect value.
    const validator: SimIamPolicyDocumentValidator =
      new SimIamPolicyDocumentValidator();
    const policyDocument = JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Permit",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::example-bucket/*",
      },
    });

    // When the policy document is validated.
    const error = assertThrowsError(() => {
      validator.validateRequired(policyDocument);
    });

    // Then the malformed document error explains that only Allow or Deny are accepted.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertStringIncludes(
      error.message,
      'IAM policy statement Effect must be either "Allow" or "Deny"',
    );
  });

  it("rejects statements without Action or NotAction", () => {
    // Given an IAM policy statement has Effect but no action selector.
    const validator: SimIamPolicyDocumentValidator =
      new SimIamPolicyDocumentValidator();
    const policyDocument = JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Resource: "arn:aws:s3:::example-bucket/*",
      },
    });

    // When the policy document is validated.
    const error = assertThrowsError(() => {
      validator.validateRequired(policyDocument);
    });

    // Then the malformed document error explains that Action or NotAction is required.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertStringIncludes(
      error.message,
      "IAM policy statement must define either Action or NotAction",
    );
  });

  it("rejects statements without Resource or NotResource", () => {
    // Given an IAM policy statement has Effect and Action but no resource selector.
    const validator: SimIamPolicyDocumentValidator =
      new SimIamPolicyDocumentValidator();
    const policyDocument = JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:GetObject",
      },
    });

    // When the policy document is validated.
    const error = assertThrowsError(() => {
      validator.validateRequired(policyDocument);
    });

    // Then the malformed document error explains that Resource or NotResource is required.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertStringIncludes(
      error.message,
      "IAM policy statement must define either Resource or NotResource",
    );
  });
});
