import { assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import { samAsyncTargetPolicies } from "./sim-cfn-sam-function-async-targets.js";

describe("SAM asynchronous delivery target policies", () => {
  it("grants an S3 destination ListBucket on the bucket and PutObject on its objects", () => {
    const bucketArn = { "Fn::GetAtt": ["Results", "Arn"] };

    const [policy] = samAsyncTargetPolicies("RatesRoleOnSuccessPolicy", {
      type: "S3Bucket",
      arn: bucketArn,
    });

    assertObjectEquals(policy, {
      PolicyName: "RatesRoleOnSuccessPolicy",
      PolicyDocument: {
        Version: "2012-10-17",
        Statement: [
          { Effect: "Allow", Action: "s3:ListBucket", Resource: bucketArn },
          {
            Effect: "Allow",
            Action: "s3:PutObject",
            Resource: { "Fn::Join": ["", [bucketArn, "/*"]] },
          },
        ],
      },
    });
  });

  it("grants a queue destination SendMessage on the queue", () => {
    const [policy] = samAsyncTargetPolicies("RatesRoleOnFailurePolicy", {
      type: "SQS",
      arn: "arn:aws:sqs:eu-west-2:111111111111:failures",
    });

    assertObjectEquals(policy?.["PolicyDocument"], {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "sqs:SendMessage",
          Resource: "arn:aws:sqs:eu-west-2:111111111111:failures",
        },
      ],
    });
  });
});
