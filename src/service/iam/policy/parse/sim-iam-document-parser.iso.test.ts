import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimIamMalformedPolicyDocument } from "../../error/sim-iam.error.js";
import type { SimIamPolicyDocument } from "../sim-iam-policy.js";
import { SimIamPolicyDocumentParser } from "./sim-iam-document-parser.js";

describe("SimIamPolicyDocumentParser", () => {
  it("parses a policy document with a single statement object", () => {
    // Given a policy document with Statement as a single statement object.
    const parser = new SimIamPolicyDocumentParser();
    const statement = {
      Effect: "Allow",
      Action: "s3:GetObject",
      Resource: "*",
    } as const;
    const policy = {
      Version: "2012-10-17",
      Statement: statement,
    } satisfies SimIamPolicyDocument;

    // When the policy document is parsed.
    const parsed = parser.parse(policy);

    // Then the single statement object is parsed as one statement.
    assertArrayLength(parsed.statements, 1);
    assertIdentical(parsed.statements[0].source, statement);
    assertIdentical(parsed.statements[0].effect, "Allow");
    assertIdentical(parsed.statements[0].actions?.[0], "s3:GetObject");
    assertIdentical(parsed.statements[0].resources?.[0], "*");
  });

  it("copies readonly string array values when parsing statement fields", () => {
    // Given a policy document with a readonly array value.
    const parser = new SimIamPolicyDocumentParser();
    const actions = ["s3:GetObject", "s3:ListBucket"] as const;
    const policy = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: actions,
          Resource: "*",
        },
      ],
    } satisfies SimIamPolicyDocument;

    // When the policy document is parsed.
    const parsed = parser.parse(policy);

    // Then the parsed array contains the same values.
    assertArrayLength(parsed.statements, 1);
    assertIdentical(parsed.statements[0].actions?.[0], "s3:GetObject");
    assertIdentical(parsed.statements[0].actions[1], "s3:ListBucket");
  });

  it("reports a malformed policy when a statement field holds an object", () => {
    // Given a stored policy document whose Resource holds an unresolved
    // CloudFormation intrinsic in place of an ARN.
    const parser = new SimIamPolicyDocumentParser();
    const policy = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "athena:StartQueryExecution",
          Resource: { "Fn::GetAtt": ["DoesNotExist", "Arn"] },
        },
      ],
    } as unknown as SimIamPolicyDocument;

    // When the policy document is parsed.
    const error = assertThrowsError(() => {
      parser.parse(policy);
    });

    // Then the malformed document is reported, naming the statement and the
    // value it holds.
    assertInstanceOf(error, SimIamMalformedPolicyDocument);
    assertIdentical(
      error.message,
      "IAM policy statement 1: Resource must be a string or an array of " +
        'strings, but holds {"Fn::GetAtt":["DoesNotExist","Arn"]}',
    );
  });
});
