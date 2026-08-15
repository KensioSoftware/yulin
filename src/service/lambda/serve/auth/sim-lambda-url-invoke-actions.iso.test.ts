import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simLambdaUrlRequiresInvokeFunction } from "./sim-lambda-url-invoke-actions.js";

const cloudFrontPrincipal = {
  kind: "service",
  service: "cloudfront.amazonaws.com",
} as const;

describe("Actions a sim Lambda Function URL request is authorized against", () => {
  it("takes lambda:InvokeFunction as well for CloudFront", () => {
    // Given the caller an origin access control reaches a Function URL as,
    // resolved at the HTTP boundary the way the controller passes it on.
    const caller = {
      kind: "resolved",
      principal: cloudFrontPrincipal,
      identityPolicyPrincipal: cloudFrontPrincipal,
    } as const;

    // Then the URL action on its own is not enough, as it is not on AWS.
    assertTrue(simLambdaUrlRequiresInvokeFunction(caller));
  });

  it("takes lambda:InvokeFunction as well for a bare CloudFront principal", () => {
    // Given the same service principal named directly rather than resolved.
    assertTrue(simLambdaUrlRequiresInvokeFunction(cloudFrontPrincipal));
  });

  it("takes only the URL action for another service", () => {
    // Given a service principal that is not CloudFront, which reaches a
    // function through Invoke rather than through its URL.
    const caller = {
      kind: "service",
      service: "s3.amazonaws.com",
    } as const;

    // Then nothing beyond the URL action is asked for.
    assertFalse(simLambdaUrlRequiresInvokeFunction(caller));
  });

  it("takes only the URL action for a caller signing its own request", () => {
    // Given a Role reaching the Function URL with a signature of its own.
    const caller = {
      kind: "arn",
      arn: "arn:aws:iam::111111111111:role/ReaderRole",
    } as const;

    // Then the distinction between the two actions holds: a policy can grant
    // the HTTP endpoint without granting the SDK operation.
    assertFalse(simLambdaUrlRequiresInvokeFunction(caller));
  });

  it("takes only the URL action for credentials", () => {
    // Given credentials, which name a principal only once IAM has
    // authenticated them, and which no origin access control presents.
    const caller = {
      kind: "credentials",
      credentials: {
        accessKeyId: "AKIAEXAMPLE",
        secretAccessKey: "example-secret",
      },
    } as const;

    // Then the caller is judged on the URL action alone.
    assertFalse(simLambdaUrlRequiresInvokeFunction(caller));
  });
});
