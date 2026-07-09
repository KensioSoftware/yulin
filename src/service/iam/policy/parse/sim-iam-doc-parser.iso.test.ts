import { assertArrayLength, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimIamPolicyDocument } from "../sim-iam-policy.js";
import { SimIamPolicyDocumentParser } from "./sim-iam-doc-parser.js";

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
});
