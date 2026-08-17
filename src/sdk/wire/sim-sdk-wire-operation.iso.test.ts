import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  readSimSdkWireCredentialScope,
  readSimSdkWireOperation,
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
});
