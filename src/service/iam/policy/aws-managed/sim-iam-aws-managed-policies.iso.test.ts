import {
  assertArrayIncludesAll,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimArn } from "../../../aws/arn.js";
import { jsonParse } from "../../../../util/type-guard/json.js";
import {
  simIamAwsManagedPolicies,
  simIamAwsManagedPolicy,
} from "./sim-iam-aws-managed-policies.js";

describe("AWS-managed policy catalogue", () => {
  it("holds the document AWS publishes for a policy", () => {
    // Given the ARN of AmazonS3ReadOnlyAccess.
    const arn = "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess" as SimArn;

    // When the catalogue is asked for it.
    const policy = simIamAwsManagedPolicy(arn);

    // Then it has the policy's name, path and document.
    assertNonNullable(policy);
    assertNonNullable(policy.policyDocument);
    assertIdentical(policy.policyName, "AmazonS3ReadOnlyAccess");
    assertIdentical(policy.path, "/");
    assertIdentical(
      JSON.stringify(jsonParse(policy.policyDocument)),
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "s3:Get*",
              "s3:List*",
              "s3:Describe*",
              "s3-object-lambda:Get*",
              "s3-object-lambda:List*",
            ],
            Resource: "*",
          },
        ],
      }),
    );
  });

  it("answers for the same policy in another partition", () => {
    // Given an AWS-managed policy ARN in the China partition.
    const arn =
      "arn:aws-cn:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" as SimArn;

    // When the catalogue is asked for it.
    const policy = simIamAwsManagedPolicy(arn);

    // Then it answers with that ARN and the policy's path.
    assertNonNullable(policy);
    assertIdentical(policy.arn, arn);
    assertIdentical(policy.path, "/service-role/");
  });

  it("holds nothing for an ARN outside it or for an Account's own policy", () => {
    // Given an uncatalogued AWS-managed ARN and a customer-managed one.
    const uncatalogued =
      "arn:aws:iam::aws:policy/AmazonMacieFullAccess" as SimArn;
    const customer =
      "arn:aws:iam::123456789012:policy/AmazonS3ReadOnlyAccess" as SimArn;

    // When the catalogue is asked for each.
    // Then it holds neither.
    assertUndefined(simIamAwsManagedPolicy(uncatalogued));
    assertUndefined(simIamAwsManagedPolicy(customer));
  });

  it("lists every catalogued policy in the aws partition", () => {
    // When the catalogue is listed.
    const arns: string[] = simIamAwsManagedPolicies().map(
      (policy) => policy.arn,
    );

    // Then it includes the policies CDK and SAM attach most often.
    assertArrayIncludesAll(arns, [
      "arn:aws:iam::aws:policy/AdministratorAccess",
      "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
    ]);
  });
});
