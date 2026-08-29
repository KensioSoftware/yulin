import { jsonStringify } from "../../../util/type-guard/json.js";
import type { SimIamPolicyDocument } from "./sim-iam-policy.js";

/**
 * Build a policy document IAM would measure at exactly this many characters.
 *
 * A test about IAM's character limits has a size to state rather than a
 * statement. Padding an ARN leaves a document IAM would otherwise take, so the
 * size is the only thing the command is being asked about. The size is the one
 * IAM counts, of the document written compactly, and a caller is free to
 * indent what it hands over.
 */
export function simIamPolicyDocumentOfSize(
  characters: number,
): SimIamPolicyDocument {
  return padded(characters, (padding) => ({
    Version: "2012-10-17",
    Statement: {
      Effect: "Allow",
      Action: "s3:GetObject",
      Resource: `arn:aws:s3:::reports-bucket/${padding}`,
    },
  }));
}

/**
 * Build a Role trust policy document of exactly this many characters.
 *
 * A trust policy carries a Principal and no Resource, so it is padded through
 * a Sid instead.
 */
export function simIamTrustPolicyDocumentOfSize(
  characters: number,
): SimIamPolicyDocument {
  return padded(characters, (padding) => ({
    Version: "2012-10-17",
    Statement: {
      Sid: padding,
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  }));
}

function padded(
  characters: number,
  make: (padding: string) => SimIamPolicyDocument,
): SimIamPolicyDocument {
  const unpadded = jsonStringify(make("")).length;

  return make("x".repeat(characters - unpadded));
}
