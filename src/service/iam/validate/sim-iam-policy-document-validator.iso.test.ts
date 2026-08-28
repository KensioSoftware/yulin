import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimIamMalformedPolicyDocument } from "../error/sim-iam.error.js";
import type { SimIamPolicyDocument } from "../policy/sim-iam-policy.js";
import { SimIamPolicyDocumentValidator } from "./sim-iam-policy-document-validator.js";

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
      'IAM policy statement 1: Effect must be either "Allow" or "Deny"',
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
      'IAM policy statement 1: Effect must be either "Allow" or "Deny"',
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
      "IAM policy statement 1: must define either Action or NotAction",
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
      "IAM policy statement 1: must define either Resource or NotResource",
    );
  });

  it("rejects a statement field holding an object", () => {
    // Given an IAM policy statement whose Resource holds an unresolved
    // CloudFormation intrinsic in place of an ARN.
    const validator: SimIamPolicyDocumentValidator =
      new SimIamPolicyDocumentValidator();
    const policyDocument = JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "athena:StartQueryExecution",
        Resource: { "Fn::GetAtt": ["DoesNotExist", "Arn"] },
      },
    });

    // When the policy document is validated for a Role's inline policy.
    const error = assertThrowsError(() => {
      validator.validateRequired(policyDocument, {
        attachedTo: "Role",
        name: "QueryRole",
        policyName: "RunQueries",
      });
    });

    // Then the document is rejected naming the Role, the policy, the statement
    // and the value it holds.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertIdentical(
      error.message,
      'Role "QueryRole" policy "RunQueries" statement 1: Resource must be a ' +
        "string or an array of strings, but holds " +
        '{"Fn::GetAtt":["DoesNotExist","Arn"]}',
    );
  });

  it("rejects a statement field holding an array of anything else", () => {
    // Given an IAM policy statement whose Action list holds an object among
    // its action names.
    const validator: SimIamPolicyDocumentValidator =
      new SimIamPolicyDocumentValidator();
    const policyDocument = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["s3:GetObject", { Ref: "ExtraAction" }],
          Resource: "arn:aws:s3:::example-bucket/*",
        },
      ],
    });

    // When the policy document is validated.
    const error = assertThrowsError(() => {
      validator.validateRequired(policyDocument);
    });

    // Then the document is rejected naming the field and what it holds.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertIdentical(
      error.message,
      "IAM policy statement 1: Action must be a string or an array of " +
        'strings, but holds ["s3:GetObject",{"Ref":"ExtraAction"}]',
    );
  });

  it("names the statement a malformed value is in", () => {
    // Given an IAM policy document whose second statement is the malformed one.
    const validator: SimIamPolicyDocumentValidator =
      new SimIamPolicyDocumentValidator();
    const policyDocument = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::example-bucket/*",
        },
        {
          Effect: "Allow",
          Action: { Ref: "QueryAction" },
          Resource: "*",
        },
      ],
    });

    // When the policy document is validated for a User's inline policy.
    const error = assertThrowsError(() => {
      validator.validateRequired(policyDocument, {
        attachedTo: "User",
        name: "Analyst",
        policyName: "RunQueries",
      });
    });

    // Then the rejection names the statement the malformed value is in.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertIdentical(
      error.message,
      'User "Analyst" policy "RunQueries" statement 2: Action must be a ' +
        'string or an array of strings, but holds {"Ref":"QueryAction"}',
    );
  });
});
