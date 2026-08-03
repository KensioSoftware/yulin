import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsCallerResolver } from "../../../aws/caller/sim-aws-caller-resolver.js";
import { simS3EventPrincipalId } from "./sim-s3-event-principal.js";

const resolver = new SimAwsCallerResolver();

describe("The principal an S3 event says caused it", () => {
  it("names an IAM principal by ARN", () => {
    // Given a caller resolved to an IAM Role
    const caller = resolver.resolve(
      { kind: "arn", arn: "arn:aws:iam::888888888888:role/UploaderRole" },
      { kind: "anonymous" },
    );

    // When the event names it
    const principalId = simS3EventPrincipalId(caller);

    // Then the ARN goes in. Real S3 puts the principal's unique id here, and
    // simulated IAM has no unique-id namespace to draw one from.
    assertIdentical(principalId, "arn:aws:iam::888888888888:role/UploaderRole");
  });

  it("names a service by its service principal", () => {
    // Given a caller resolved to a simulated service
    const caller = resolver.resolve(
      { kind: "service", service: "cloudfront.amazonaws.com" },
      { kind: "anonymous" },
    );

    // When the event names it
    const principalId = simS3EventPrincipalId(caller);

    // Then the service principal goes in
    assertIdentical(principalId, "cloudfront.amazonaws.com");
  });

  it("says so when nobody was named", () => {
    // Given an anonymous caller, which is what an unsigned request resolves to
    const caller = resolver.resolve(
      { kind: "anonymous" },
      { kind: "anonymous" },
    );

    // When the event names it
    const principalId = simS3EventPrincipalId(caller);

    // Then the field is still there, saying there was no principal
    assertIdentical(principalId, "anonymous");
  });
});
