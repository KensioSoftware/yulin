/**
 * A token that cannot be read as a JWT.
 *
 * Everything that goes wrong before a signature can be checked is one of
 * these: the wrong number of parts, a segment that is not base64url JSON, or a
 * header missing the fields a JWT header has. Whether that refusal is worth a
 * 401 or something else is the caller's decision, so nothing here carries a
 * status code.
 */
export class SimJwtError extends Error {
  public override readonly name = "SimJwtError";
}
