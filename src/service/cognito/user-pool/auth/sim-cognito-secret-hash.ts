/* eslint-disable security/detect-possible-timing-attacks -- this is a
   simulator in one process, where the secret hash is checked so a test notices
   a client secret it forgot to use, rather than as a defence against anyone
   measuring how long the check took. */
import { createHmac } from "node:crypto";
import { SimCognitoNotAuthorizedException } from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPoolClient } from "../client/sim-cognito-user-pool-client.js";

/**
 * Compute the `SECRET_HASH` a request from an app client should carry.
 *
 * It is the HMAC-SHA256 of the username and the client id, keyed by the client
 * secret, which is what the AWS SDKs compute.
 */
export function simCognitoSecretHash(
  username: string,
  clientId: string,
  clientSecret: string,
): string {
  return createHmac("sha256", clientSecret)
    .update(`${username}${clientId}`)
    .digest("base64");
}

/**
 * Refuse a request whose `SECRET_HASH` is missing or wrong.
 *
 * Checking it is what makes a test notice a client secret it forgot to use,
 * rather than finding out on a real pool. A client without a secret needs
 * none, and one sent anyway is ignored, as real Cognito ignores it.
 */
export function requireSimCognitoSecretHash(
  username: string,
  client: SimCognitoUserPoolClient,
  secretHash: string | undefined,
): void {
  const { secret } = client;

  if (secret === undefined) {
    return;
  }

  if (secretHash !== simCognitoSecretHash(username, client.id, secret)) {
    throw new SimCognitoNotAuthorizedException(
      `Unable to verify secret hash for client ${client.id}.`,
    );
  }
}
