import {
  CreateDistributionCommand,
  CreateInvalidationCommand,
  GetInvalidationCommand,
  ListInvalidationsCommand,
} from "@aws-sdk/client-cloudfront";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimCloudFront } from "../../sim-cloudfront.js";

/**
 * A Distribution to authorize against, with no Origins because nothing here
 * serves a request.
 */
async function distributionId(simCloudFront: SimCloudFront): Promise<string> {
  const creation = await simCloudFront.createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "invalidation-authorization",
        Comment: "Authorized invalidations",
        Enabled: true,
        Origins: { Quantity: 0, Items: [] },
        DefaultCacheBehavior: {
          TargetOriginId: "origin-a",
          ViewerProtocolPolicy: "allow-all",
        },
      },
    }),
  );

  assertNonNullable(creation.Distribution?.Id);

  return creation.Distribution.Id;
}

describe("CloudFront invalidation IAM authorization", () => {
  it("denies a caller the action on the Distribution ARN", async () => {
    // Given a Distribution in a known simulated AWS Account.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simCloudFront = simAws.account(accountId).cloudFront();
    const distribution = await distributionId(simCloudFront);

    // When an anonymous caller asks for an invalidation of it.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simCloudFront.createInvalidation(
          new CreateInvalidationCommand({
            DistributionId: distribution,
            InvalidationBatch: {
              CallerReference: "denied",
              Paths: { Quantity: 1, Items: ["/*"] },
            },
          }),
          { caller: { kind: "anonymous" } },
        ),
    );

    // Then IAM denies the action against the Distribution's own ARN.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "cloudfront:CreateInvalidation");
    assertIdentical(
      error.resource,
      `arn:aws:cloudfront::${accountId}:distribution/${distribution}`,
    );
  });

  it("does not reveal a missing Distribution to an unauthorized caller", async () => {
    // Given a simulated CloudFront holding no Distributions.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simCloudFront = simAws.account(accountId).cloudFront();

    // When an anonymous caller reads invalidations of an ID that does not
    // exist.
    const read = await assertThrowsErrorAsync(
      async () =>
        await simCloudFront.getInvalidation(
          new GetInvalidationCommand({
            DistributionId: "EMISSINGDISTRIB",
            Id: "IMISSINGINVALID",
          }),
          { caller: { kind: "anonymous" } },
        ),
    );
    const listed = await assertThrowsErrorAsync(
      async () =>
        await simCloudFront.listInvalidations(
          new ListInvalidationsCommand({ DistributionId: "EMISSINGDISTRIB" }),
          { caller: { kind: "anonymous" } },
        ),
    );

    // Then IAM denies both before CloudFront can say the Distribution is
    // absent.
    assertInstanceOf(read, SimIamAccessDenied);
    assertIdentical(read.action, "cloudfront:GetInvalidation");
    assertInstanceOf(listed, SimIamAccessDenied);
    assertIdentical(listed.action, "cloudfront:ListInvalidations");
  });
});
