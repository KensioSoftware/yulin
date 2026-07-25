import { describe, it } from "vitest";
import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";

import { parseSimArn } from "./arn.js";

describe("parseSimArn", () => {
  it("reads the parts of an ARN", () => {
    // Given an ACM certificate ARN.
    // When it is parsed.
    const arn = parseSimArn(
      "arn:aws:acm:us-east-1:111111111111:certificate/00000001",
    );

    // Then every part is available.
    assertNonNullable(arn);
    assertIdentical(arn.partition, "aws");
    assertIdentical(arn.service, "acm");
    assertIdentical(arn.region, "us-east-1");
    assertIdentical(arn.accountId, "111111111111");
    assertIdentical(arn.resourceType, "certificate");
    assertIdentical(arn.resourceId, "00000001");
  });

  it("reads an ARN with no region, as CloudFront has", () => {
    // Given a CloudFront distribution ARN, which carries no region.
    // When it is parsed.
    const arn = parseSimArn(
      "arn:aws:cloudfront::111111111111:distribution/E1234567890123",
    );

    // Then the region is empty rather than the ARN being rejected.
    assertNonNullable(arn);
    assertIdentical(arn.region, "");
    assertIdentical(arn.resourceType, "distribution");
  });

  it("keeps a resource ID containing slashes intact", () => {
    // Given an ARN whose resource ID contains a slash.
    // When it is parsed.
    const arn = parseSimArn("arn:aws:s3:::bucket/path/to/object.txt");

    // Then only the first slash separates type from ID.
    assertNonNullable(arn);
    assertIdentical(arn.resourceType, "bucket");
    assertIdentical(arn.resourceId, "path/to/object.txt");
  });

  it("rejects a value that is not an ARN", () => {
    // Given a value that is not an ARN at all.
    // When it is parsed, then there is nothing to read.
    assertUndefined(parseSimArn("not-an-arn"));
  });

  it("rejects an ARN in another partition", () => {
    // Given an ARN outside the aws partition, which the simulator does not
    // model.
    // When it is parsed, then there is nothing to read.
    assertUndefined(
      parseSimArn("arn:aws-cn:acm:cn-north-1:111111111111:certificate/1"),
    );
  });

  it("rejects an ARN with no resource separator", () => {
    // Given an ARN whose resource has no type, as SQS queue ARNs do not.
    // When it is parsed, then there is nothing to read.
    assertUndefined(parseSimArn("arn:aws:sqs:us-east-1:111111111111:my-queue"));
  });

  it("rejects an ARN missing trailing parts", () => {
    // Given a truncated ARN.
    // When it is parsed, then there is nothing to read.
    assertUndefined(parseSimArn("arn:aws:acm:us-east-1"));
  });
});
