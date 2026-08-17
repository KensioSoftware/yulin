import { createHash } from "node:crypto";

import { faker } from "@faker-js/faker";
import {
  assertIdentical,
  assertObjectEquals,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { fetchThroughDistribution } from "../../../../../test/cloudfront/function-url-distribution.js";
import { simIamSigV4ContentSha256Header } from "../../../iam/sigv4/canonical/sim-iam-sigv4-payload-hash.js";
import {
  simLambdaUrlForbiddenMessage,
  simLambdaUrlSignatureMismatchMessage,
} from "../../../lambda/serve/response/sim-lambda-url-error-response.js";
import { simCfFunctionUrlOriginTemplateFactory } from "./sim-cf-function-url-origin-template.factory.js";

/**
 * The SHA-256 a client computes over the body it is about to send, which is
 * the whole of what CloudFront asks of a viewer posting through an origin
 * access control.
 */
function sha256(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

describe("Posting through a CloudFront origin access control", () => {
  it("refuses a POST that declares no payload hash", async () => {
    // Given a viewer posting a form to a Function URL Origin without stating
    // what the body hashes to, which is what a browser form post is
    const response = await fetchThroughDistribution(
      simCfFunctionUrlOriginTemplateFactory.make({}),
      () => ({ method: "POST", body: faker.lorem.sentence() }),
    );

    // Then CloudFront had nothing to sign the body with, so the Function URL
    // answers the signature mismatch real Lambda answers, and the handler
    // never ran
    assertResponseStatus(response, 403, await describeResponse(response));
    assertObjectEquals(await response.json(), {
      Message: simLambdaUrlSignatureMismatchMessage,
    });
  });

  it("refuses a PUT that declares no payload hash", async () => {
    // Given the other method AWS names, sent the same way
    const response = await fetchThroughDistribution(
      simCfFunctionUrlOriginTemplateFactory.make({}),
      () => ({ method: "PUT", body: faker.lorem.sentence() }),
    );

    // Then it is refused for the same reason
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("refuses a POST declaring the hash of some other body", async () => {
    // Given a viewer stating a digest of bytes other than the ones it sends,
    // which is the only thing a signature over a declaration can catch
    const response = await fetchThroughDistribution(
      simCfFunctionUrlOriginTemplateFactory.make({}),
      () => ({
        method: "POST",
        body: faker.lorem.sentence(),
        headers: {
          [simIamSigV4ContentSha256Header]: sha256(faker.lorem.paragraph()),
        },
      }),
    );

    // Then the body that arrived is not the body the request claims, so it is
    // refused rather than passed on to the function
    assertResponseStatus(response, 403, await describeResponse(response));
    assertObjectEquals(await response.json(), {
      Message: simLambdaUrlSignatureMismatchMessage,
    });
  });

  it("invokes the function for a POST declaring the hash of its body", async () => {
    // Given a viewer that computed the SHA-256 of the body it sends, as AWS
    // documents a POST through an origin access control has to
    const body = faker.lorem.sentence();
    const response = await fetchThroughDistribution(
      simCfFunctionUrlOriginTemplateFactory.make({}),
      () => ({
        method: "POST",
        body,
        headers: { [simIamSigV4ContentSha256Header]: sha256(body) },
      }),
    );

    // Then the request reaches the handler, with the body it was posted
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), body);
  });

  it("invokes the function for an empty body declared as the empty hash", async () => {
    // Given a POST with no body at all, declaring the digest of no bytes
    const response = await fetchThroughDistribution(
      simCfFunctionUrlOriginTemplateFactory.make({}),
      () => ({
        method: "POST",
        body: "",
        headers: { [simIamSigV4ContentSha256Header]: sha256("") },
      }),
    );

    // Then it is admitted: an empty body is a body like any other, and this is
    // the digest of it
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "Hello from behind CloudFront");
  });

  it("leaves a GET alone", async () => {
    // Given a viewer fetching a page, stating nothing about a body it does not
    // have
    const response = await fetchThroughDistribution(
      simCfFunctionUrlOriginTemplateFactory.make({}),
    );

    // Then nothing is asked of it: SigV4 hashes an empty payload for a GET, so
    // CloudFront can sign one without the viewer's help
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "Hello from behind CloudFront");
  });

  it("leaves a HEAD alone", async () => {
    // Given the other method that carries no body
    const response = await fetchThroughDistribution(
      simCfFunctionUrlOriginTemplateFactory.make({}),
      () => ({ method: "HEAD" }),
    );

    // Then it reaches the Origin as a GET does
    assertResponseStatus(response, 200, await describeResponse(response));
  });

  it("still reaches the Origin anonymously when the origin access control never signs", async () => {
    // Given an origin access control turned off, and a POST stating no hash
    const response = await fetchThroughDistribution(
      simCfFunctionUrlOriginTemplateFactory.make({ signingBehavior: "never" }),
      () => ({ method: "POST", body: faker.lorem.sentence() }),
    );

    // Then nothing signs the Origin request, so nothing declares a payload for
    // it either: the `AWS_IAM` Function URL refuses it for being anonymous,
    // which is what it did before any of this
    assertResponseStatus(response, 403, await describeResponse(response));
    assertObjectEquals(await response.json(), {
      Message: simLambdaUrlForbiddenMessage,
    });
  });
});
