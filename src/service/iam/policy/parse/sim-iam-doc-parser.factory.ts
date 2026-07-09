import { StaticFactory } from "@kensio/part-factory";
import type { SimIamParsedPolicyStatement } from "./sim-iam-doc-parser.js";

/**
 * Generates parsed IAM policy statements for tests.
 */
export const simIamParsedPolicyStatementFactory =
  new StaticFactory<SimIamParsedPolicyStatement>({
    source: {
      Effect: "Allow",
      Action: "s3:GetObject",
      Resource: "arn:aws:s3:::test-bucket/test-key",
    },
    effect: "Allow",
    actions: ["s3:GetObject"],
    resources: ["arn:aws:s3:::test-bucket/test-key"],
  });
