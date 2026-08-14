import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimCognitoUserPool } from "../user-pool/sim-cognito-user-pool.js";

/**
 * The OpenID Connect discovery metadata of a user pool, in the shape the real
 * `.../.well-known/openid-configuration` endpoint serves.
 */
export interface SimCognitoOpenIdConfigurationDocument {
  readonly issuer: string;
  readonly jwks_uri: string;
  readonly authorization_endpoint?: string | undefined;
  readonly token_endpoint?: string | undefined;
  readonly end_session_endpoint?: string | undefined;
  readonly id_token_signing_alg_values_supported: readonly string[];
  readonly response_types_supported: readonly string[];
  readonly scopes_supported: readonly string[];
  readonly subject_types_supported: readonly string[];
  readonly token_endpoint_auth_methods_supported: readonly string[];
}

/**
 * Builds the discovery document a simulated user pool publishes.
 *
 * The issuer and the JWKS URI name the origin the request arrived on rather
 * than the real AWS one. A client that discovers a document has to be able to
 * fetch the keys it points at, and pointing at `cognito-idp.<region>.amazonaws.com`
 * would send it to real AWS. The tokens themselves still carry the real issuer
 * in `iss`, which is what a verifier builds from a pool id and checks against,
 * so the two disagree here and agree on real Cognito.
 *
 * The OAuth endpoints are published once the pool has a domain, and left out
 * until then, because until then they do not exist. They name the domain's own
 * local hostname for the same reason the issuer names the local one: a client
 * that discovers an endpoint has to be able to reach it.
 *
 * No `userinfo_endpoint` is published, because that endpoint is not
 * simulated. A client discovering nothing there fails rather than calling an
 * endpoint that would not answer.
 */
export class SimCognitoOpenIdConfiguration {
  /**
   * The discovery document for a pool, as served from an origin.
   */
  document(
    pool: SimCognitoUserPool,
    origin: string,
  ): SimCognitoOpenIdConfigurationDocument {
    const issuer = `${origin}/${pool.id}`;

    return {
      issuer,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
      ...this.hostedEndpoints(pool, origin),
      id_token_signing_alg_values_supported: ["RS256"],
      response_types_supported: ["code", "token"],
      scopes_supported: ["openid", "email", "phone", "profile"],
      subject_types_supported: ["public"],
      token_endpoint_auth_methods_supported: [
        "client_secret_basic",
        "client_secret_post",
      ],
    };
  }

  /**
   * The endpoints a pool's hosted domain serves, for a pool that has one.
   */
  private hostedEndpoints(
    pool: SimCognitoUserPool,
    origin: string,
  ): Partial<SimCognitoOpenIdConfigurationDocument> {
    const domain = pool.auth.domain;

    if (domain === undefined) {
      return {};
    }

    const domainUrl = new SimAwsLocalUrl({
      input: `https://${domain.hostname}/`,
      port: new URL(origin).port,
    }).toURL();

    return {
      authorization_endpoint: `${domainUrl.origin}/oauth2/authorize`,
      token_endpoint: `${domainUrl.origin}/oauth2/token`,
      end_session_endpoint: `${domainUrl.origin}/logout`,
    };
  }
}
