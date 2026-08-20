import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  readSimSdkWireCredentialScope,
  readSimSdkWireOperation,
  readSimSdkWirePresignedCredentialScope,
} from "./sim-sdk-wire-operation.js";
import type { SimSdkWireRequest } from "./sim-sdk-wire.types.js";

function requestWithHeaders(
  headers: Record<string, string>,
): SimSdkWireRequest {
  return {
    method: "POST",
    hostname: "dynamodb.eu-west-2.amazonaws.com",
    path: "/",
    headers,
    body: new Uint8Array(),
  };
}

function requestForTarget(target: string): SimSdkWireRequest {
  return requestWithHeaders(Object.fromEntries([["x-amz-target", target]]));
}

function requestSignedWith(credential: string): SimSdkWireRequest {
  return requestWithHeaders(
    Object.fromEntries([
      [
        "authorization",
        `AWS4-HMAC-SHA256 Credential=${credential}, ` +
          "SignedHeaders=host;x-amz-date, Signature=abc123",
      ],
    ]),
  );
}

function presignedPathFor(credential: string): string {
  return `/reports/q3/report.pdf?X-Amz-Credential=${encodeURIComponent(
    credential,
  )}`;
}

describe("simulated AWS SDK wire operation", () => {
  it("reads the service and Command a JSON protocol request names", () => {
    // Given a request as an AWS JSON protocol service is sent.
    // When its operation is read.
    const operation = readSimSdkWireOperation(
      requestForTarget("AWSCognitoIdentityProviderService.InitiateAuth"),
    );

    // Then it names the same service and Command an intercepted client would
    // have reported for the call.
    assertNonNullable(operation);
    assertIdentical(operation.serviceId, "Cognito Identity Provider");
    assertIdentical(operation.commandName, "InitiateAuthCommand");
  });

  it("reads nothing from a request that names no operation", () => {
    // Given requests that name no operation this can route.
    // Then none of them yields one.
    assertUndefined(readSimSdkWireOperation(requestWithHeaders({})));
    assertUndefined(readSimSdkWireOperation(requestForTarget("NoSeparator")));
    assertUndefined(readSimSdkWireOperation(requestForTarget(".GetItem")));
    assertUndefined(
      readSimSdkWireOperation(requestForTarget("DynamoDB_20120810.")),
    );
    assertUndefined(
      readSimSdkWireOperation(requestForTarget("UnsimulatedService.DoThing")),
    );
  });

  it("reads the Region and service a request was signed for", () => {
    // Given a signed request.
    // When its credential scope is read.
    const scope = readSimSdkWireCredentialScope(
      requestWithHeaders(
        Object.fromEntries([
          [
            "authorization",
            "AWS4-HMAC-SHA256 Credential=ASIAEXAMPLE/20260817/us-east-1/" +
              "sqs/aws4_request, SignedHeaders=host;x-amz-date, " +
              "Signature=abc123",
          ],
        ]),
      ),
    );

    // Then it says which Region and which service the signature covers.
    assertNonNullable(scope);
    assertIdentical(scope.regionName, "us-east-1");
    assertIdentical(scope.signingName, "sqs");
  });

  it("reads nothing from a request that is not signed", () => {
    // Given requests carrying no usable credential scope.
    const bearerHeaders = Object.fromEntries([
      ["authorization", "Bearer a-token"],
    ]);

    // Then neither yields one.
    assertUndefined(readSimSdkWireCredentialScope(requestWithHeaders({})));
    assertUndefined(
      readSimSdkWireCredentialScope(requestWithHeaders(bearerHeaders)),
    );
  });

  it("reads the Region and service a presigned URL was signed for", () => {
    // Given the path of a presigned URL, which carries its credential in the
    // query string and no Authorization header anywhere.
    // When its credential scope is read.
    const scope = readSimSdkWirePresignedCredentialScope(
      "/reports/q3/report.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256" +
        "&X-Amz-Credential=AKIAEXAMPLE%2F20260817%2Feu-west-2%2Fs3" +
        "%2Faws4_request&X-Amz-Signature=abc123",
    );

    // Then it says which Region and which service the signature covers, the
    // same as the header form would for the same signature.
    assertNonNullable(scope);
    assertIdentical(scope.regionName, "eu-west-2");
    assertIdentical(scope.signingName, "s3");
  });

  it("reads a presigned credential parameter whatever case it is written in", () => {
    // Given a presigned URL whose parameter names are lower-cased, as a client
    // that built the URL for itself may write them.
    // When its credential scope is read.
    const scope = readSimSdkWirePresignedCredentialScope(
      "/reports/q3/report.pdf?x-amz-credential=" +
        "AKIAEXAMPLE%2F20260817%2Fus-east-1%2Fsqs%2Faws4_request",
    );

    // Then the signing name still comes back.
    assertNonNullable(scope);
    assertIdentical(scope.signingName, "sqs");
  });

  it("reads nothing from a path that presigns nothing", () => {
    // Given paths carrying no usable presigned credential.
    // Then none of them yields a scope.
    assertUndefined(readSimSdkWirePresignedCredentialScope("/reports"));
    assertUndefined(
      readSimSdkWirePresignedCredentialScope("/reports?x-id=Get"),
    );
    assertUndefined(
      readSimSdkWirePresignedCredentialScope("/reports?X-Amz-Credential=AKIA"),
    );
    assertUndefined(
      readSimSdkWirePresignedCredentialScope(
        "/reports?X-Amz-Credential=AKIA%2Feu-west-2",
      ),
    );
  });

  it("reads nothing from a scope naming no Region or no service", () => {
    // Given signatures whose scope leaves the Region or the service empty,
    // saying nothing about where the request should go.
    const emptyRegion = requestSignedWith("ASIA/20260817//sqs/aws4_request");
    const emptyService = requestSignedWith(
      "ASIA/20260817/us-east-1//aws4_request",
    );

    // Then none of them routes anywhere, in either form.
    assertUndefined(readSimSdkWireCredentialScope(emptyRegion));
    assertUndefined(readSimSdkWireCredentialScope(emptyService));
    assertUndefined(
      readSimSdkWirePresignedCredentialScope(
        presignedPathFor("ASIA/20260817//s3/aws4_request"),
      ),
    );
  });

  it("routes a scope whose shape simulated IAM will refuse", () => {
    // Given a signature scoped to a real Region and service, and terminated
    // with something SigV4 never writes.
    // When it is read for routing.
    const scope = readSimSdkWirePresignedCredentialScope(
      presignedPathFor("ASIA/20260817/eu-west-2/s3/not_aws4_request"),
    );

    // Then it still says which service to route to. Refusing it is signature
    // verification's to do, and that names what was wrong with it.
    assertNonNullable(scope);
    assertIdentical(scope.signingName, "s3");
  });
});
