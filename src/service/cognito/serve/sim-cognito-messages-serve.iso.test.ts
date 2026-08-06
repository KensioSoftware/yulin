import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertObjectMatches,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";

function localUrl(input: string): string {
  return new SimAwsLocalUrl({ input }).toString();
}

function messagesUrl(userPoolId: string): string {
  return localUrl(
    `https://cognito-idp.eu-west-2.amazonaws.com/${userPoolId}/messages`,
  );
}

/**
 * A pool that has sent one verification message.
 */
async function poolWithMessageIn(simAws: SimAws): Promise<string> {
  const cognito = simAws.cognitoIdentityProvider();
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({
      PoolName: "myapp-users",
      AutoVerifiedAttributes: ["email"],
    }),
  );
  assertNonNullable(created.UserPool?.Id);

  const userPoolId = created.UserPool.Id;
  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: "web",
    }),
  );
  assertNonNullable(client.UserPoolClient?.ClientId);

  await cognito.signUp(
    new SignUpCommand({
      ClientId: client.UserPoolClient.ClientId,
      Username: "alice",
      Password: "Sup3rSecret!",
      UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
    }),
  );

  return userPoolId;
}

describe("Serving the messages a sim Cognito user pool would have sent", () => {
  it("lists the messages a pool has recorded", async () => {
    // Given a pool that a user has signed itself up to.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const userPoolId = await poolWithMessageIn(simAws);

    // When the pool's messages are requested.
    const response = await new SimAwsHttp({ simAws }).fetch(
      messagesUrl(userPoolId),
    );

    // Then the verification message is listed, with everything about it a
    // reader needs during local development.
    assertIdentical(response.status, 200);
    assertIdentical(response.headers.get("content-type"), "application/json");

    const code = simAws
      .cognitoIdentityProvider()
      .userPool(userPoolId)
      .confirmationCode("alice");
    assertNonNullable(code);
    assertObjectMatches(await response.json(), {
      messages: [
        {
          username: "alice",
          recipient: "alice@example.com",
          medium: "EMAIL",
          subject: "Your verification code",
          body: `Your verification code is ${code}`,
          occasion: "SignUp",
        },
      ],
    });
  });

  it("lists nothing for a pool that has sent nothing", async () => {
    // Given a pool no user has signed up to.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const created = await simAws
      .cognitoIdentityProvider()
      .createUserPool(new CreateUserPoolCommand({ PoolName: "myapp-users" }));
    assertNonNullable(created.UserPool?.Id);

    // When its messages are requested.
    const response = await new SimAwsHttp({ simAws }).fetch(
      messagesUrl(created.UserPool.Id),
    );

    // Then the listing is empty rather than missing.
    assertIdentical(response.status, 200);
    assertObjectEquals(await response.json(), { messages: [] });
  });

  it("answers a HEAD with the headers a GET would", async () => {
    // Given a pool that has recorded a message.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const userPoolId = await poolWithMessageIn(simAws);
    const simAwsHttp = new SimAwsHttp({ simAws });

    // When the listing is asked for with HEAD, and with a method that reads
    // no document at all.
    const headed = await simAwsHttp.fetch(messagesUrl(userPoolId), {
      method: "HEAD",
    });
    const posted = await simAwsHttp.fetch(messagesUrl(userPoolId), {
      method: "POST",
    });

    // Then the HEAD answers the headers with no body, and the write is
    // refused.
    assertIdentical(headed.status, 200);
    assertIdentical(await headed.text(), "");
    assertIdentical(posted.status, 405);
  });

  it("reports a pool it does not serve as not found", async () => {
    // Given a simulated AWS with no user pools.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    // When an invented pool's messages are requested.
    const response = await new SimAwsHttp({ simAws }).fetch(
      messagesUrl("eu-west-2_aBcDeFgHi"),
    );

    // Then the endpoint reports it as not found, as it does for the JWKS.
    assertIdentical(response.status, 404);
  });

  it("reports a path below the listing as not found", async () => {
    // Given a pool that has recorded a message.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const userPoolId = await poolWithMessageIn(simAws);
    const simAwsHttp = new SimAwsHttp({ simAws });

    // When something below the messages path is requested.
    const belowListing = await simAwsHttp.fetch(`${messagesUrl(userPoolId)}/0`);

    // And when a published document is asked for under it rather than under
    // .well-known.
    const jwks = await simAwsHttp.fetch(`${messagesUrl(userPoolId)}/jwks.json`);

    // Then neither is served: there is no endpoint for one message, and the
    // two published documents sit under .well-known and nowhere else.
    assertIdentical(belowListing.status, 404);
    assertIdentical(jwks.status, 404);
  });
});
