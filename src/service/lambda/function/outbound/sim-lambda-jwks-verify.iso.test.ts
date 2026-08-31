import https from "node:https";
import {
  CognitoIdentityProviderClient,
  GetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { describe, it } from "vitest";

import {
  simCognitoSignedIn,
  type SimCognitoSignedInSetUp,
} from "../../../../../test/cognito/signed-in-fixture.js";
import type { SimLambdaHandler } from "../sim-lambda-handler.type.js";

/**
 * The template an API declares its request-handling function by.
 *
 * The execution role is in the simulation's default Account, which is where
 * the pool is, so an SDK Command the function sends reaches that pool. The
 * function declares a variable of its own because an in-process handler is
 * given the runtime environment only when it declares one, and an SDK bundled
 * into function code reads its Region and its credentials from there.
 */
const apiFunctionTemplate = {
  Resources: {
    ApiFunction: {
      Type: "AWS::Lambda::Function",
      Properties: {
        FunctionName: "api",
        Role: "arn:aws:iam::888888888888:role/ApiRole",
        Handler: "index.handler",
        Runtime: "nodejs22.x",
        Code: { ZipFile: "exports.handler = async () => 'api';" },
        Environment: { Variables: { APP_NAME: "myapp" } },
      },
    },
  },
};

/**
 * What the handlers here answer a request with, which is what the function
 * read at the endpoint it asked.
 */
interface FetchedDocument {
  readonly status: number;
  readonly body: unknown;
}

/**
 * The event the handlers are invoked with.
 */
interface VerifyEvent {
  readonly url?: string;
  readonly userPoolId?: string;
  readonly clientId?: string;
  readonly accessToken?: string;
}

/**
 * The regional Cognito endpoint a pool's public documents are published at,
 * which is the hostname a handler names and the only one a verifier builds.
 */
function regionalEndpointUrl(userPoolId: string, document: string): string {
  return `https://cognito-idp.eu-west-2.amazonaws.com/${userPoolId}/.well-known/${document}`;
}

/**
 * A handler that reads a published document with `fetch`, as a Node.js handler
 * doing this is written today.
 */
const fetchingHandler: SimLambdaHandler = async (
  event: VerifyEvent,
): Promise<FetchedDocument> => {
  const response = await fetch(String(event.url));

  return { status: response.status, body: await response.json() };
};

/**
 * A handler that reads the same document through `node:https`, which is the
 * client `aws-jwt-verify` fetches a JWKS with.
 */
const httpsHandler: SimLambdaHandler = async (
  event: VerifyEvent,
): Promise<FetchedDocument> =>
  await new Promise((resolve, reject) => {
    const request = https.request(String(event.url), (response) => {
      const chunks: Buffer[] = [];

      response.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      response.on("end", () => {
        resolve({
          status: response.statusCode ?? 0,
          body: JSON.parse(Buffer.concat(chunks).toString()) as unknown,
        });
      });
    });

    request.on("error", reject);
    request.end();
  });

/**
 * Deploy the function with a handler bound to it.
 */
async function deployApi(
  setUp: SimCognitoSignedInSetUp,
  handler: SimLambdaHandler,
): Promise<void> {
  const stack = await setUp.simAws.cloudFormation().deployTemplate({
    stackName: "api-stack",
    template: apiFunctionTemplate,
    bindings: [{ functionName: "api", handler }],
  });

  await stack.waitForDeployComplete();
}

/**
 * Invoke the deployed function and read what it answered with.
 */
async function invokedWith(
  setUp: SimCognitoSignedInSetUp,
  event: VerifyEvent,
): Promise<unknown> {
  const output = await setUp.simAws.lambda().invoke(
    new InvokeCommand({
      FunctionName: "api",
      Payload: JSON.stringify(event),
    }),
  );

  assertUndefined(output.FunctionError);
  assertNonNullable(output.Payload);

  const answer = JSON.parse(Buffer.from(output.Payload).toString()) as unknown;

  await setUp.simAws.backgroundTasksComplete();

  return answer;
}

describe("A sim Lambda verifying a Cognito token", () => {
  it("fetches the pool's JWKS from the regional endpoint", async () => {
    // Given a pool with a signed-in user, and a function that fetches keys.
    const setUp = await simCognitoSignedIn();
    await deployApi(setUp, fetchingHandler);

    // When the handler asks for the pool's JWKS where real Cognito publishes
    // it, which is the only URL a verifier built from a pool id will ask.
    const read = (await invokedWith(setUp, {
      url: regionalEndpointUrl(setUp.userPoolId, "jwks.json"),
    })) as FetchedDocument;

    // Then the simulated pool answered with the keys it signs its tokens with.
    // oxlint-disable-next-line smartass/prefer-specific-assertions -- this is data returned by the Lambda, not a Fetch Response
    assertIdentical(read.status, 200);
    assertObjectEquals(
      read.body,
      setUp.cognito.userPool(setUp.userPoolId).jwks(),
    );
  });

  it("fetches the same JWKS through node:https", async () => {
    // Given the same pool, and a handler written without the Fetch API.
    const setUp = await simCognitoSignedIn();
    await deployApi(setUp, httpsHandler);

    // When it reads the JWKS.
    const read = (await invokedWith(setUp, {
      url: regionalEndpointUrl(setUp.userPoolId, "jwks.json"),
    })) as FetchedDocument;

    // Then the same document is served whichever client asked for it.
    // oxlint-disable-next-line smartass/prefer-specific-assertions -- this is data returned by the Lambda, not a Fetch Response
    assertIdentical(read.status, 200);
    assertObjectEquals(
      read.body,
      setUp.cognito.userPool(setUp.userPoolId).jwks(),
    );
  });

  it("fetches the pool's OpenID configuration", async () => {
    // Given the same pool and a function that fetches documents.
    const setUp = await simCognitoSignedIn();
    await deployApi(setUp, fetchingHandler);

    // When the handler asks for the discovery document.
    const read = (await invokedWith(setUp, {
      url: regionalEndpointUrl(setUp.userPoolId, "openid-configuration"),
    })) as FetchedDocument;
    const { jwks_uri: jwksUri } = read.body as { jwks_uri: string };

    // Then the JWKS URI it advertises is one the same handler can go on to
    // fetch, which is the whole point of discovering it.
    // oxlint-disable-next-line smartass/prefer-specific-assertions -- this is data returned by the Lambda, not a Fetch Response
    assertIdentical(read.status, 200);
    const discovered = (await invokedWith(setUp, {
      url: jwksUri,
    })) as FetchedDocument;
    // oxlint-disable-next-line smartass/prefer-specific-assertions -- this is data returned by the Lambda, not a Fetch Response
    assertIdentical(discovered.status, 200);
  });

  it("verifies a token with a verifier that fetches its own keys", async () => {
    // Given a function verifying tokens the way an application does, with a
    // verifier configured with nothing but the pool and the client it trusts.
    const setUp = await simCognitoSignedIn();
    await deployApi(setUp, async (event: VerifyEvent): Promise<unknown> => {
      const verifier = CognitoJwtVerifier.create({
        userPoolId: String(event.userPoolId),
        tokenUse: "access",
        clientId: String(event.clientId),
      });

      return await verifier.verify(String(event.accessToken));
    });

    // When it verifies the access token the user signed in with.
    const payload = (await invokedWith(setUp, {
      userPoolId: setUp.userPoolId,
      clientId: setUp.clientId,
      accessToken: setUp.accessToken,
    })) as { username: string };

    // Then the verifier fetched the pool's keys for itself and the token
    // verified against them, with nothing handed to it by the test.
    assertIdentical(payload.username, "alice");
  });

  it("still reaches simulated Cognito for a Command the same function sends", async () => {
    // Given a function that also calls the Cognito API, with an SDK client of
    // its own rather than one the simulator intercepted.
    const setUp = await simCognitoSignedIn();
    await deployApi(setUp, async (event: VerifyEvent): Promise<unknown> => {
      const cognito = new CognitoIdentityProviderClient({});
      const output = await cognito.send(
        new GetUserCommand({ AccessToken: String(event.accessToken) }),
      );

      return { username: output.Username };
    });

    // When it reads the user the token belongs to.
    const user = (await invokedWith(setUp, {
      accessToken: setUp.accessToken,
    })) as { username: string };

    // Then that Command reached the simulated pool, at the hostname the
    // documents above are served from.
    assertIdentical(user.username, "alice");
  });
});
