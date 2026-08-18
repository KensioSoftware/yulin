import type { SimQueryOperations } from "../../../serve/http/api/query/sim-query-operation.js";
import { iamQueryEntity } from "./sim-iam-query-entity.js";

/**
 * The members IAM describes one User with.
 */
const userMembers = ["Path", "UserName", "UserId", "Arn", "CreateDate"];

/**
 * The members IAM describes one access key with.
 *
 * `SecretAccessKey` is among them because this is the one response that
 * carries it. Real IAM answers a created key with its secret and never
 * reports it again, and a caller that did not keep it has to make another.
 */
const accessKeyMembers = [
  "UserName",
  "AccessKeyId",
  "Status",
  "SecretAccessKey",
  "CreateDate",
];

/**
 * The User operations simulated IAM serves over the Query protocol.
 *
 * This is the pair that makes an endpoint usable from outside the process that
 * built the simulation: a shell script or a container creates a User, gives it
 * a policy and asks for an access key, and then signs its own requests with
 * what it was answered.
 */
export function simIamQueryUserOperations(): SimQueryOperations {
  return new Map([
    [
      "CreateUser",
      {
        input: (fields): Record<string, unknown> => ({
          UserName: fields.text("UserName"),
          Path: fields.text("Path"),
        }),
        result: (output): string => iamQueryEntity(output, "User", userMembers),
      },
    ],
    [
      "CreateAccessKey",
      {
        input: (fields): Record<string, unknown> => ({
          UserName: fields.text("UserName"),
        }),
        result: (output): string =>
          iamQueryEntity(output, "AccessKey", accessKeyMembers),
      },
    ],
    [
      "PutUserPolicy",
      {
        input: (fields): Record<string, unknown> => ({
          UserName: fields.text("UserName"),
          PolicyName: fields.text("PolicyName"),
          PolicyDocument: fields.text("PolicyDocument"),
        }),
        result: (): string => "",
      },
    ],
  ]);
}
