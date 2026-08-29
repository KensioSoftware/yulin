import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { jsonStringify } from "../../../../util/type-guard/json.js";
import { SimIamLimitExceeded } from "../../error/sim-iam.error.js";
import {
  simIamPolicyDocumentOfSize,
  simIamTrustPolicyDocumentOfSize,
} from "../../policy/sim-iam-policy-document-of-size.js";
import {
  assertSimIamInlinePolicyWithinSizeLimit,
  assertSimIamManagedPolicyWithinSizeLimit,
  assertSimIamTrustPolicyWithinSizeLimit,
  maxSimIamInlinePolicyCharacters,
  maxSimIamManagedPolicyCharacters,
  maxSimIamTrustPolicyCharacters,
  simIamPolicyDocumentSize,
} from "./sim-iam-policy-document-size.js";

describe("simIamPolicyDocumentSize", () => {
  it("counts the characters of a document written without whitespace", () => {
    // Given a policy document of a stated size.
    const policyDocument = jsonStringify(simIamPolicyDocumentOfSize(512));

    // When the document is measured.
    const size = simIamPolicyDocumentSize(policyDocument);

    // Then the count is the size it was built at.
    assertIdentical(size, 512);
  });

  it("leaves whitespace out of the count", () => {
    // Given the same document indented for a reader.
    const indented = jsonStringify(
      simIamPolicyDocumentOfSize(512),
      undefined,
      2,
    );

    // When the indented document is measured.
    const size = simIamPolicyDocumentSize(indented);

    // Then indenting it counted for nothing.
    assertIdentical(size, 512);
  });
});

describe("assertSimIamManagedPolicyWithinSizeLimit", () => {
  it("accepts a document of exactly the limit", () => {
    // Given a managed policy document at the limit itself.
    const policyDocument = jsonStringify(
      simIamPolicyDocumentOfSize(maxSimIamManagedPolicyCharacters),
    );

    // When the document is measured against the limit.
    assertSimIamManagedPolicyWithinSizeLimit(policyDocument);

    // Then it is accepted.
  });

  it("accepts a document only under the limit once whitespace is out", () => {
    // Given a managed policy document at the limit, indented past it.
    const indented = jsonStringify(
      simIamPolicyDocumentOfSize(maxSimIamManagedPolicyCharacters),
      undefined,
      4,
    );

    // When the indented document is measured against the limit.
    assertSimIamManagedPolicyWithinSizeLimit(indented);

    // Then the indentation it carries is not what decides it.
  });

  it("refuses a document one character over the limit", () => {
    // Given a managed policy document one character past the limit.
    const policyDocument = jsonStringify(
      simIamPolicyDocumentOfSize(maxSimIamManagedPolicyCharacters + 1),
    );

    // When the document is measured against the limit.
    const error = assertThrowsError(() => {
      assertSimIamManagedPolicyWithinSizeLimit(policyDocument);
    });

    // Then it is refused in IAM's own wording.
    assertInstanceOf(error, SimIamLimitExceeded);
    assertIdentical(error.name, "LimitExceeded");
    assertIdentical(error.message, "Cannot exceed quota for PolicySize: 6144");
  });

  it("has nothing to measure when the document is absent", () => {
    // Given no managed policy document at all.

    // When the absent document is measured against the limit.
    assertSimIamManagedPolicyWithinSizeLimit(undefined);

    // Then requiredness is left to the check that owns it.
  });
});

describe("assertSimIamInlinePolicyWithinSizeLimit", () => {
  it("accepts a document of exactly the limit", () => {
    // Given an inline policy document at the limit itself.
    const policyDocument = jsonStringify(
      simIamPolicyDocumentOfSize(maxSimIamInlinePolicyCharacters),
    );

    // When the document is measured against the limit.
    assertSimIamInlinePolicyWithinSizeLimit(policyDocument, {
      kind: "role",
      name: "ReportingRole",
    });

    // Then it is accepted.
  });

  it("names the Role a refused document was going onto", () => {
    // Given an inline policy document one character past the limit.
    const policyDocument = jsonStringify(
      simIamPolicyDocumentOfSize(maxSimIamInlinePolicyCharacters + 1),
    );

    // When the document is measured against the limit for a Role.
    const error = assertThrowsError(() => {
      assertSimIamInlinePolicyWithinSizeLimit(policyDocument, {
        kind: "role",
        name: "ReportingRole",
      });
    });

    // Then the refusal names the Role, as IAM's message does.
    assertInstanceOf(error, SimIamLimitExceeded);
    assertIdentical(
      error.message,
      "Maximum policy size of 10240 bytes exceeded for role ReportingRole",
    );
  });

  it("names the User a refused document was going onto", () => {
    // Given an inline policy document one character past the limit.
    const policyDocument = jsonStringify(
      simIamPolicyDocumentOfSize(maxSimIamInlinePolicyCharacters + 1),
    );

    // When the document is measured against the limit for a User.
    const error = assertThrowsError(() => {
      assertSimIamInlinePolicyWithinSizeLimit(policyDocument, {
        kind: "user",
        name: "Analyst",
      });
    });

    // Then the refusal names the User.
    assertInstanceOf(error, SimIamLimitExceeded);
    assertIdentical(
      error.message,
      "Maximum policy size of 10240 bytes exceeded for user Analyst",
    );
  });

  it("has nothing to measure when the document is absent", () => {
    // Given no inline policy document at all.

    // When the absent document is measured against the limit.
    assertSimIamInlinePolicyWithinSizeLimit(undefined, {
      kind: "role",
      name: "ReportingRole",
    });

    // Then requiredness is left to the check that owns it.
  });
});

describe("assertSimIamTrustPolicyWithinSizeLimit", () => {
  it("accepts a document of exactly the limit", () => {
    // Given a trust policy document at the limit itself.
    const policyDocument = jsonStringify(
      simIamTrustPolicyDocumentOfSize(maxSimIamTrustPolicyCharacters),
    );

    // When the document is measured against the limit.
    assertSimIamTrustPolicyWithinSizeLimit(policyDocument, "ReportingRole");

    // Then it is accepted.
  });

  it("refuses a document one character over the limit", () => {
    // Given a trust policy document one character past the limit.
    const policyDocument = jsonStringify(
      simIamTrustPolicyDocumentOfSize(maxSimIamTrustPolicyCharacters + 1),
    );

    // When the document is measured against the limit.
    const error = assertThrowsError(() => {
      assertSimIamTrustPolicyWithinSizeLimit(policyDocument, "ReportingRole");
    });

    // Then it is refused naming the Role it was going onto.
    assertInstanceOf(error, SimIamLimitExceeded);
    assertIdentical(
      error.message,
      "Maximum policy size of 2048 bytes exceeded for role ReportingRole",
    );
  });
});
