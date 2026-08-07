import {
  CreateUserPoolCommand,
  DeleteUserPoolCommand,
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

async function poolIdIn(simAws: SimAws): Promise<string> {
  const created = await simAws
    .cognitoIdentityProvider()
    .createUserPool(new CreateUserPoolCommand({ PoolName: "myapp-users" }));

  assertNonNullable(created.UserPool?.Id);

  return created.UserPool.Id;
}

describe("Serving a sim Cognito user pool's public endpoints", () => {
  it("serves the pool's JWKS anonymously", async () => {
    // Given a simulated user pool.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const userPoolId = await poolIdIn(simAws);

    // When its JWKS endpoint is requested with no credentials at all.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(
        `https://cognito-idp.eu-west-2.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
      ),
    );

    // Then the pool answers with the keys it signs its tokens with.
    assertIdentical(response.status, 200);
    assertIdentical(response.headers.get("content-type"), "application/json");
    assertObjectEquals(
      await response.json(),
      simAws.cognitoIdentityProvider().userPool(userPoolId).jwks(),
    );
  });

  it("serves an OpenID configuration naming the requested hostname", async () => {
    // Given a simulated user pool.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const userPoolId = await poolIdIn(simAws);

    // When its OpenID configuration is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(
        `https://cognito-idp.eu-west-2.amazonaws.com/${userPoolId}/.well-known/openid-configuration`,
      ),
    );

    // Then the issuer and the JWKS URI are ones a client can go on to fetch,
    // which means the local hostname rather than the real AWS one.
    const issuer = `http://cognito-idp.eu-west-2.sim-aws.localhost/${userPoolId}`;
    assertIdentical(response.status, 200);
    assertObjectMatches(await response.json(), {
      issuer,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
    });
  });

  it("serves a pool created in another account", async () => {
    // Given a pool created outside the default account, so its id is the only
    // thing the request carries about where it lives.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const created = await simAws
      .account("222222222222")
      .region("eu-west-2")
      .cognitoIdentityProvider()
      .createUserPool(new CreateUserPoolCommand({ PoolName: "other-account" }));
    assertNonNullable(created.UserPool?.Id);

    // When its JWKS endpoint is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(
        `https://cognito-idp.eu-west-2.amazonaws.com/${created.UserPool.Id}/.well-known/jwks.json`,
      ),
    );

    // Then the pool is found by id alone.
    assertIdentical(response.status, 200);
  });

  it("reports an unknown pool id as not found", async () => {
    // Given a simulated AWS with no user pools.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    // When an invented pool id's JWKS is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(
        "https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_aBcDeFgHi/.well-known/jwks.json",
      ),
    );

    // Then the endpoint reports it as not found.
    assertIdentical(response.status, 404);
    assertObjectEquals(await response.json(), {
      message: "User pool eu-west-2_aBcDeFgHi does not exist.",
    });
  });

  it("does not serve a pool through another region's endpoint", async () => {
    // Given a pool in eu-west-2.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const userPoolId = await poolIdIn(simAws);

    // When its JWKS is requested from the us-east-1 endpoint.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(
        `https://cognito-idp.us-east-1.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
      ),
    );

    // Then the pool is not found there, because a pool id names its region.
    assertIdentical(response.status, 404);
  });

  it("reports any other path on the endpoint as not found", async () => {
    // Given a simulated user pool.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const userPoolId = await poolIdIn(simAws);

    // When something other than the two public endpoints is requested.
    const simAwsHttp = new SimAwsHttp({ simAws });
    const wellKnown = await simAwsHttp.fetch(
      localUrl(
        `https://cognito-idp.eu-west-2.amazonaws.com/${userPoolId}/.well-known/oauth-authorization-server`,
      ),
    );
    const apiPath = await simAwsHttp.fetch(
      localUrl("https://cognito-idp.eu-west-2.amazonaws.com/"),
    );

    // Then neither is served: the Cognito API itself is reached through SimSdk
    // rather than over HTTP.
    assertIdentical(wellKnown.status, 404);
    assertIdentical(apiPath.status, 404);
  });

  it("reports a path below an endpoint as not found", async () => {
    // Given a simulated user pool.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const userPoolId = await poolIdIn(simAws);

    // When something below the JWKS path is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(
        `https://cognito-idp.eu-west-2.amazonaws.com/${userPoolId}/.well-known/jwks.json/keys`,
      ),
    );

    // Then it is not served, rather than treated as the JWKS path with
    // something after it.
    assertIdentical(response.status, 404);
  });

  it("answers only the methods a document is read with", async () => {
    // Given a simulated user pool.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const userPoolId = await poolIdIn(simAws);
    const jwksUrl = localUrl(
      `https://cognito-idp.eu-west-2.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
    );
    const simAwsHttp = new SimAwsHttp({ simAws });

    // When its JWKS is asked for with a method that does not read one.
    const posted = await simAwsHttp.fetch(jwksUrl, { method: "POST" });

    // And when it is asked for with HEAD.
    const headed = await simAwsHttp.fetch(jwksUrl, { method: "HEAD" });

    // Then the write is refused, and says what the endpoint does answer.
    assertIdentical(posted.status, 405);
    assertIdentical(posted.headers.get("allow"), "GET, HEAD");

    // And the HEAD answers the headers a GET would, with no document.
    assertIdentical(headed.status, 200);
    assertIdentical(headed.headers.get("content-type"), "application/json");
    const jwks = simAws.cognitoIdentityProvider().userPool(userPoolId).jwks();
    const jwksLength = Buffer.byteLength(JSON.stringify(jwks));
    assertIdentical(headed.headers.get("content-length"), String(jwksLength));
    assertIdentical(await headed.text(), "");
  });

  it("reports a path naming no pool as not found", async () => {
    // Given a simulated user pool.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    await poolIdIn(simAws);

    // When the JWKS path is requested with no pool id in it.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(
        "https://cognito-idp.eu-west-2.amazonaws.com//.well-known/jwks.json",
      ),
    );

    // Then there is no endpoint there, rather than a pool with no name.
    assertIdentical(response.status, 404);
    assertObjectEquals(await response.json(), {
      message: "No simulated Cognito endpoint at //.well-known/jwks.json",
    });
  });

  it("stops serving a pool that has been deleted", async () => {
    // Given a pool that is then deleted.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const userPoolId = await poolIdIn(simAws);
    await simAws
      .cognitoIdentityProvider()
      .deleteUserPool(new DeleteUserPoolCommand({ UserPoolId: userPoolId }));

    // When its JWKS is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(
        `https://cognito-idp.eu-west-2.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
      ),
    );

    // Then the endpoint no longer answers for it.
    assertIdentical(response.status, 404);
  });
});
