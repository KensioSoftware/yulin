/**
 * The authorization scheme a bearer token is usually sent under.
 *
 * API Gateway takes the token with or without it, so it is stripped when it is
 * there rather than required. The comparison is case-insensitive, since HTTP
 * authorization schemes are.
 */
const bearerPrefix = /^bearer\s+/iu;

/**
 * The token an identity source value carries, if it carries one at all.
 *
 * This is how a verifier of tokens reads the value. A Lambda authorizer is
 * handed the value as it arrived instead, since what it names may be a cookie
 * or an API key rather than a bearer token.
 */
export function simJwtBearerToken(
  value: string | undefined,
): string | undefined {
  const token = value?.replace(bearerPrefix, "").trim();

  if (token === undefined || token.length === 0) {
    return undefined;
  }

  return token;
}
