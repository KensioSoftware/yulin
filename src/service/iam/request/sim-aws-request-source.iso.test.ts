import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  SimAwsRequestSource,
  simAwsSourceAccountHeaderName,
  simAwsSourceArnHeaderName,
} from "./sim-aws-request-source.js";

describe("SimAwsRequestSource", () => {
  it("reads the resource a request is made on behalf of", () => {
    // Given a request stating the Distribution it came from, as sim CloudFront
    // states one reaching an Origin through an origin access control.
    const source = SimAwsRequestSource.fromHeaders(
      new Headers({
        [simAwsSourceArnHeaderName]:
          "arn:aws:cloudfront::888888888888:distribution/E1EXAMPLE12345",
        [simAwsSourceAccountHeaderName]: "888888888888",
      }),
    );

    // Then both are read, which is the pair a grant to a service principal is
    // conditioned on.
    assertNonNullable(source);
    assertIdentical(
      source.arn,
      "arn:aws:cloudfront::888888888888:distribution/E1EXAMPLE12345",
    );
    assertIdentical(source.accountId, "888888888888");
  });

  it("has no Account when only the resource was stated", () => {
    // Given a request naming the resource and not the Account, which is what
    // a permission conditioned on the ARN alone needs.
    const source = SimAwsRequestSource.fromHeaders(
      new Headers({
        [simAwsSourceArnHeaderName]:
          "arn:aws:cloudfront::888888888888:distribution/E1EXAMPLE12345",
      }),
    );

    assertUndefined(source?.accountId);
  });

  it("is nothing at all when the request stated no source", () => {
    // Given an ordinary request, which is every request that is not one
    // service calling another for a resource.
    const source = SimAwsRequestSource.fromHeaders(new Headers());

    // Then there is no source rather than an empty one, so a policy
    // conditioned on either key fails to match instead of matching an empty
    // string.
    assertUndefined(source);
  });
});
