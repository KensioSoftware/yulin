import type { Brand } from "../../../../util/brand.type.js";
import { SimCognitoIdentifier } from "../sim-cognito-identifier.js";

export type SimCognitoGroupName = Brand<string, "SimCognitoGroupName">;

/**
 * Read a requested group name, or refuse a malformed one.
 *
 * A group name is the identifier every group operation names a group by, and
 * it takes the same form as a username, which is where the rule lives.
 */
export function requireSimCognitoGroupName(
  value: string | undefined,
): SimCognitoGroupName {
  return new SimCognitoIdentifier({
    field: "GroupName",
    subject: "group",
    value,
  }).value as SimCognitoGroupName;
}
