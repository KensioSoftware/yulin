import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimIamMalformedPolicyDocument } from "../../error/sim-iam.error.js";
import type { SimIamPolicyDocument } from "../../policy/sim-iam-policy.js";
import { SimIamTrustPolicyDocumentValidator } from "./sim-iam-trust-policy-document-validator.js";

describe("SimIamTrustPolicyDocumentValidator", () => {
  const validator: SimIamTrustPolicyDocumentValidator =
    new SimIamTrustPolicyDocumentValidator();

  it("accepts a trust policy with a string Principal", () => {
    // Given a valid trust policy using a string Principal.

    const policyDocument = JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "sts:AssumeRole",
        Principal: "arn:aws:iam::123456789012:root",
      },
    } satisfies SimIamPolicyDocument);

    // When the trust policy is validated.
    validator.validateRequired(policyDocument);

    // Then no validation error is thrown.
  });

  it("accepts trust policy statement arrays using NotAction and NotPrincipal", () => {
    // Given a valid trust policy using the supported negative selectors.
    const policyDocument = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Deny",
          NotAction: "sts:AssumeRoleWithSAML",
          NotPrincipal: ["arn:aws:iam::123456789012:root"],
        },
      ],
    } satisfies SimIamPolicyDocument);

    // When the trust policy is validated.
    validator.validateRequired(policyDocument);

    // Then no validation error is thrown.
  });

  it("accepts AWS and Service principal maps with scalar and array values", () => {
    // Given a valid trust policy containing every supported principal map shape.
    const policyDocument = JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "sts:AssumeRole",
        Principal: {
          AWS: "arn:aws:iam::123456789012:root",
          Service: ["lambda.amazonaws.com", "ecs-tasks.amazonaws.com"],
        },
      },
    } satisfies SimIamPolicyDocument);

    // When the trust policy is validated.
    validator.validateRequired(policyDocument);

    // Then no validation error is thrown.
  });

  it("rejects a missing required trust policy", () => {
    // Given a required trust policy is absent.

    // When the missing policy is validated.
    const error = assertThrowsError(() => {
      validator.validateRequired(undefined);
    });

    // Then a required-field error is thrown.
    assertStringIncludes(error.message, "AssumeRolePolicyDocument is required");
  });

  it("rejects an empty required trust policy", () => {
    // Given a required trust policy is an empty string.

    // When the empty policy is validated.
    const error = assertThrowsError(() => {
      validator.validateRequired("");
    });

    // Then a required-field error is thrown.
    assertStringIncludes(error.message, "AssumeRolePolicyDocument is required");
  });

  it("rejects a statement with an invalid Effect", () => {
    // Given a trust policy statement has an unsupported Effect.
    const policyDocument = JSON.stringify({
      Statement: {
        Effect: "Permit",
        Action: "sts:AssumeRole",
        Principal: "*",
      },
    });

    // When the trust policy is validated.
    const error = assertThrowsError(() => {
      validator.validateRequired(policyDocument);
    });

    // Then the malformed policy error identifies the invalid Effect.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertStringIncludes(
      error.message,
      'Effect must be either "Allow" or "Deny"',
    );
  });

  it("rejects a statement without Action or NotAction", () => {
    // Given a trust policy statement has no action selector.
    const policyDocument = JSON.stringify({
      Statement: {
        Effect: "Allow",
        Principal: "*",
      },
    });

    // When the trust policy is validated.
    const error = assertThrowsError(() => {
      validator.validateRequired(policyDocument);
    });

    // Then the malformed policy error requires an action selector.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertStringIncludes(error.message, "either Action or NotAction");
  });

  it("rejects a statement without Principal or NotPrincipal", () => {
    // Given a trust policy statement has no principal selector.
    const policyDocument = JSON.stringify({
      Statement: {
        Effect: "Allow",
        Action: "sts:AssumeRole",
      },
    });

    // When the trust policy is validated.
    const error = assertThrowsError(() => {
      validator.validateRequired(policyDocument);
    });

    // Then the malformed policy error requires a principal selector.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertStringIncludes(error.message, "either Principal or NotPrincipal");
  });

  it("rejects a statement with both Principal and NotPrincipal", () => {
    // Given a trust policy statement defines conflicting principal selectors.
    const policyDocument = JSON.stringify({
      Statement: {
        Effect: "Allow",
        Action: "sts:AssumeRole",
        Principal: "*",
        NotPrincipal: "arn:aws:iam::123456789012:root",
      },
    });

    // When the trust policy is validated.
    const error = assertThrowsError(() => {
      validator.validateRequired(policyDocument);
    });

    // Then the malformed policy error identifies the conflict.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertStringIncludes(
      error.message,
      "cannot define both Principal and NotPrincipal",
    );
  });

  it("rejects a statement with Resource", () => {
    // Given a trust policy statement explicitly defines Resource.
    const policyDocument = JSON.stringify({
      Statement: {
        Effect: "Allow",
        Action: "sts:AssumeRole",
        Principal: "*",
        Resource: "*",
      },
    });

    // When the trust policy is validated.
    const error = assertThrowsError(() => {
      validator.validateRequired(policyDocument);
    });

    // Then the malformed policy error rejects resource selectors.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertStringIncludes(
      error.message,
      "cannot define Resource or NotResource",
    );
  });

  it("rejects a statement with NotResource", () => {
    // Given a trust policy statement explicitly defines NotResource.
    const policyDocument = JSON.stringify({
      Statement: {
        Effect: "Deny",
        Action: "sts:AssumeRole",
        Principal: "*",
        NotResource: "*",
      },
    });

    // When the trust policy is validated.
    const error = assertThrowsError(() => {
      validator.validateRequired(policyDocument);
    });

    // Then the malformed policy error rejects resource selectors.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertStringIncludes(
      error.message,
      "cannot define Resource or NotResource",
    );
  });

  it("rejects an unsupported principal type", () => {
    // Given a trust policy uses an unsupported principal map key.
    const policyDocument = JSON.stringify({
      Statement: {
        Effect: "Allow",
        Action: "sts:AssumeRole",
        Principal: {
          Federated: "accounts.google.com",
        },
      },
    });

    // When the trust policy is validated.
    const error = assertThrowsError(() => {
      validator.validateRequired(policyDocument);
    });

    // Then the malformed policy error identifies the unsupported type.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertStringIncludes(error.message, "principal type: Federated");
  });

  it("rejects an empty string Principal", () => {
    // Given a trust policy has an empty scalar Principal.
    const policyDocument = JSON.stringify({
      Statement: {
        Effect: "Allow",
        Action: "sts:AssumeRole",
        Principal: "",
      },
    });

    // When the trust policy is validated.
    const error = assertThrowsError(() => {
      validator.validateRequired(policyDocument);
    });

    // Then the malformed policy error rejects the empty principal.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertStringIncludes(error.message, "principal cannot be empty");
  });

  it("rejects an empty value in a Principal array", () => {
    // Given a trust policy Principal array contains an empty value.
    const policyDocument = JSON.stringify({
      Statement: {
        Effect: "Allow",
        Action: "sts:AssumeRole",
        Principal: ["arn:aws:iam::123456789012:root", ""],
      },
    });

    // When the trust policy is validated.
    const error = assertThrowsError(() => {
      validator.validateRequired(policyDocument);
    });

    // Then the malformed policy error rejects the empty principal.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertStringIncludes(error.message, "principal cannot be empty");
  });

  it("rejects an empty scalar value in a principal map", () => {
    // Given a supported principal map has an empty scalar value.
    const policyDocument = JSON.stringify({
      Statement: {
        Effect: "Allow",
        Action: "sts:AssumeRole",
        Principal: {
          Service: "",
        },
      },
    });

    // When the trust policy is validated.
    const error = assertThrowsError(() => {
      validator.validateRequired(policyDocument);
    });

    // Then the malformed policy error rejects the empty principal.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertStringIncludes(error.message, "principal cannot be empty");
  });

  it("rejects an empty array value in a principal map", () => {
    // Given a supported principal map array contains an empty value.
    const policyDocument = JSON.stringify({
      Statement: {
        Effect: "Allow",
        Action: "sts:AssumeRole",
        Principal: {
          AWS: ["arn:aws:iam::123456789012:root", ""],
        },
      },
    });

    // When the trust policy is validated.
    const error = assertThrowsError(() => {
      validator.validateRequired(policyDocument);
    });

    // Then the malformed policy error rejects the empty principal.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertStringIncludes(error.message, "principal cannot be empty");
  });
});
