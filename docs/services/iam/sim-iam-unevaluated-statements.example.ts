/**
 * Reporting simulated IAM statements that could not be evaluated.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

simAws.organizations().attachServiceControlPolicy(
  "123456789012",
  {
    Version: "2012-10-17",
    Statement: {
      Sid: "DenyBucketCreationAfterFreeze",
      Effect: "Deny",
      Action: "s3:CreateBucket",
      Resource: "*",
      Condition: {
        DateGreaterThan: { "aws:CurrentTime": "2026-01-01T00:00:00Z" },
      },
    },
  },
  { policyName: "BucketGuardrail" },
);

const decision = simAws.account("123456789012").iam().authorize({
  action: "s3:CreateBucket",
  resource: "arn:aws:s3:::123456789012-reports",
});

const [unevaluated] = decision.unevaluatedStatements;

console.log(decision.isAllowed); // true
console.log(unevaluated?.policy); // "BucketGuardrail"
console.log(unevaluated?.reason); // "unsupported condition operator DateGreaterThan"
