import http from "node:http";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCognitoAuthorizationCode,
  simCognitoCallbackUrl,
  simCognitoHosted,
  type SimCognitoHostedSetUp,
} from "../../../../../test/cognito/federation-fixture.js";
import { makeLambdaZipFileInput } from "../code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../sim-lambda-handler.type.js";

/**
 * What the handler reports about the answer it received.
 */
interface ReceivedResponse {
  readonly statusCode: number | undefined;
  readonly location: string | undefined;
}

/**
 * A handler that starts an authorization code grant through `node:http`,
 * which is the transport module rather than the Fetch API.
 */
function authorizeHandler(setUp: SimCognitoHostedSetUp): SimLambdaHandler {
  const parameters = new URLSearchParams({
    response_type: "code",
    client_id: setUp.clientId,
    redirect_uri: simCognitoCallbackUrl,
    identity_provider: "Google",
  });

  return async (): Promise<ReceivedResponse> =>
    await new Promise((resolve, reject) => {
      const request = http.get(
        `http://${setUp.domainHost}/oauth2/authorize?${parameters.toString()}`,
        (response) => {
          response.resume();
          resolve({
            statusCode: response.statusCode,
            location: response.headers.location,
          });
        },
      );

      request.on("error", reject);
    });
}

/**
 * Create a function backed by a real in-process handler and invoke it.
 */
async function invoked(
  setUp: SimCognitoHostedSetUp,
  handler: SimLambdaHandler,
): Promise<ReceivedResponse> {
  await setUp.simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "user",
      Role: "arn:aws:iam::111111111111:role/UserRole",
      Code: { ZipFile: makeLambdaZipFileInput(handler) },
    }),
  );

  const output = await setUp.simAws
    .lambda()
    .invoke(new InvokeCommand({ FunctionName: "user" }));

  assertUndefined(output.FunctionError);
  assertNonNullable(output.Payload);

  const received = JSON.parse(
    Buffer.from(output.Payload).toString(),
  ) as ReceivedResponse;

  await setUp.simAws.backgroundTasksComplete();

  return received;
}

describe("The HTTP clients an in-process sim Lambda handler uses", () => {
  it("answers a node:http request to a hostname the simulation serves", async () => {
    // Given a pool with a hosted domain, and a user signed in at its
    // identity provider.
    const setUp = await simCognitoHosted();
    await simCognitoAuthorizationCode(setUp);

    // When a function backed by a real in-process handler starts the grant
    // through `node:http`.
    const received = await invoked(setUp, authorizeHandler(setUp));

    // Then the simulated hosted domain answered it, rather than the request
    // leaving for the real hostname.
    assertIdentical(received.statusCode, 302);
    assertNonNullable(received.location);
    assertStringIncludes(received.location, simCognitoCallbackUrl);
  });
});
