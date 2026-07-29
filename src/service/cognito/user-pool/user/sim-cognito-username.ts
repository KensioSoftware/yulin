import type { Brand } from "../../../../util/brand.type.js";
import { SimCognitoIdentifier } from "../sim-cognito-identifier.js";

export type SimCognitoUsername = Brand<string, "SimCognitoUsername">;

/**
 * Read a requested username, or refuse a malformed one.
 *
 * A username is the identifier every admin operation names a user by, and it
 * takes the same form as a group name, which is where the rule lives.
 */
export function requireSimCognitoUsername(
  value: string | undefined,
): SimCognitoUsername {
  return new SimCognitoIdentifier({ field: "Username", subject: "user", value })
    .value as SimCognitoUsername;
}
