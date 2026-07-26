import { describe, expect, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { signAwsRequest } from "../../../../test/sigv4/sign-aws-request.js";
import {
  createSigner,
  signerEndpoint,
  simulationWithSigner,
} from "../../../../test/sigv4/sim-signer.js";

describe("Verifying a SigV4 signed request", () => {
  it("resolves the principal that signed a request", async () => {
    // Given a request signed by the real AWS signer with simulated credentials
    const { simAws, credentials, userArn } = await simulationWithSigner();
    const signed = await signAwsRequest({ url: signerEndpoint, credentials });

    // When the simulator verifies it
    const identity = simAws.verifySignedRequest(signed.request);

    // Then the signing IAM user is who the request is attributed to
    expect(identity.principal).toStrictEqual({ kind: "arn", arn: userArn });
  });

  it("verifies a signed request carrying a path, query and body", async () => {
    // Given a signed POST exercising everything the canonical request covers
    const { simAws, credentials, userArn } = await simulationWithSigner();
    const signed = await signAwsRequest({
      url: `${signerEndpoint}orders/a%2Fb?name=yulin&name=again&a-b=1&x=%20sp`,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-custom": "  keep  me  ",
      },
      body: '{"name":"yulin"}',
      credentials,
    });

    // When the simulator verifies it
    const identity = simAws.verifySignedRequest(signed.request, signed.body);

    // Then path encoding, repeated and sorted query keys, collapsed header
    // whitespace and the body hash all agree with the real signer
    expect(identity.principal).toStrictEqual({ kind: "arn", arn: userArn });
  });

  it("verifies a signature stamped hours from the current time", async () => {
    // Given a request signed well away from now
    const { simAws, credentials, userArn } = await simulationWithSigner();
    const signed = await signAwsRequest({
      url: signerEndpoint,
      credentials,
      signingDate: new Date("2020-03-12T19:03:58.000Z"),
    });

    // When the simulator verifies it
    const identity = simAws.verifySignedRequest(signed.request);

    // Then it is accepted: signature age is deliberately not enforced, so a
    // client stamping a time this simulation does not keep is not locked out
    expect(identity.principal).toStrictEqual({ kind: "arn", arn: userArn });
  });

  it("verifies a request signed with an unsigned payload", async () => {
    // Given a signer that declares the payload unsigned rather than hashing it
    const { simAws, credentials, userArn } = await simulationWithSigner();
    const signed = await signAwsRequest({
      url: signerEndpoint,
      method: "PUT",
      headers: { "x-amz-content-sha256": "UNSIGNED-PAYLOAD" },
      body: "unhashed content",
      credentials,
    });

    // When the simulator verifies it, without being given the body at all
    const identity = simAws.verifySignedRequest(signed.request);

    // Then the declared hash is honoured, because that header is itself signed
    expect(identity.principal).toStrictEqual({ kind: "arn", arn: userArn });
  });

  it("verifies a signature made by an access key in another account", async () => {
    // Given a key issued by one account in a simulation
    const simAws = new SimAws();
    const credentials = await createSigner(
      simAws.account("222222222222").iam(),
    );

    // When a different account's IAM is asked to verify a signature from it
    const signed = await signAwsRequest({ url: signerEndpoint, credentials });
    const identity = simAws.verifySignedRequest(signed.request);

    // Then the issuing account is found, because a signature names an access
    // key rather than an account
    expect(identity.principal).toStrictEqual({
      kind: "arn",
      arn: "arn:aws:iam::222222222222:user/Signer",
    });
  });
});
