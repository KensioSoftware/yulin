import { describe, expect, it } from "vitest";

import { signAwsRequest } from "../../../../test/sigv4/sign-aws-request.js";
import {
  signerEndpoint,
  simulationWithSigner,
} from "../../../../test/sigv4/sim-signer.js";
import { SimIamCredentialScopeMismatch } from "../sigv4/error/sim-iam-sigv4.error.js";
import { simAwsCallerHeaderName } from "./sim-aws-caller-header.js";

const lambdaScope = { serviceName: "lambda", regionName: "us-east-1" };

describe("Resolving the caller of a signed request", () => {
  it("resolves the principal that signed the request", async () => {
    // Given a request signed with an access key belonging to an IAM user
    const { simAws, credentials, userArn } = await simulationWithSigner();
    const signed = await signAwsRequest({ url: signerEndpoint, credentials });

    // When its caller is resolved
    const caller = simAws.resolveRequestCaller(signed.request, {
      body: signed.body,
      expectedScope: lambdaScope,
    });

    // Then the signature is what attributes the request
    expect(caller.principal).toStrictEqual({ kind: "arn", arn: userArn });
    expect(caller.authMethod).toBe("sigv4");
  });

  it("prefers the caller header over a valid signature", async () => {
    // Given a correctly signed request that also names a different principal
    const { simAws, credentials } = await simulationWithSigner();
    const named = "arn:aws:iam::111111111111:role/Reporter";
    const signed = await signAwsRequest({
      url: signerEndpoint,
      credentials,
      headers: { [simAwsCallerHeaderName]: named },
    });

    // When its caller is resolved
    const caller = simAws.resolveRequestCaller(signed.request, {
      body: signed.body,
      expectedScope: lambdaScope,
    });

    // Then the named principal wins: a developer overriding the identity of a
    // request their tooling already signs should not have to stop it signing
    expect(caller.principal).toStrictEqual({ kind: "arn", arn: named });
    expect(caller.authMethod).toBe("caller-header");
  });

  it("reports a signature scoped to the wrong service", async () => {
    // Given a request signed for S3 but sent to a Lambda Function URL
    const { simAws, credentials } = await simulationWithSigner();
    const signed = await signAwsRequest({
      url: signerEndpoint,
      credentials,
      service: "s3",
    });

    // When its caller is resolved
    // Then the mismatch is named, rather than surfacing as an unexplained
    // signature failure: the scope feeds the signing key, so nothing else
    // could tell the two apart
    expect(() =>
      simAws.resolveRequestCaller(signed.request, {
        body: signed.body,
        expectedScope: lambdaScope,
      }),
    ).toThrow(SimIamCredentialScopeMismatch);
  });

  it("reports a signature scoped to the wrong Region", async () => {
    // Given a request signed for one Region and sent to another
    const { simAws, credentials } = await simulationWithSigner();
    const signed = await signAwsRequest({
      url: signerEndpoint,
      credentials,
      region: "eu-west-2",
    });

    // When its caller is resolved
    // Then the Region is named in the failure
    expect(() =>
      simAws.resolveRequestCaller(signed.request, {
        body: signed.body,
        expectedScope: lambdaScope,
      }),
    ).toThrow(/signed for Region eu-west-2/);
  });

  it("accepts any Region when the endpoint names none", async () => {
    // Given a request signed for a Region, sent to an endpoint that is not
    // Region-specific, as a CloudFront hostname is not
    const { simAws, credentials, userArn } = await simulationWithSigner();
    const signed = await signAwsRequest({
      url: signerEndpoint,
      credentials,
      region: "eu-west-2",
    });

    // When its caller is resolved with only the service expected
    const caller = simAws.resolveRequestCaller(signed.request, {
      body: signed.body,
      expectedScope: { serviceName: "lambda" },
    });

    // Then there is nothing for the Region to disagree with
    expect(caller.principal).toStrictEqual({ kind: "arn", arn: userArn });
  });
});
