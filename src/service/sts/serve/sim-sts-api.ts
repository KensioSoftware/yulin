import type { SimAws } from "../../aws/sim-aws.js";
import { SimQueryApiEndpoint } from "../../../serve/http/api/query/sim-query-endpoint.js";
import type { SimQueryOperations } from "../../../serve/http/api/query/sim-query-operation.js";
import {
  queryMembers,
  queryStructure,
} from "../../../serve/http/api/query/sim-query-result.js";

/**
 * The XML namespace real STS stamps on every response it sends.
 */
const stsNamespace = "https://sts.amazonaws.com/doc/2011-06-15/";

/**
 * Serve the STS Query API to a client given an endpoint URL.
 *
 * The two operations simulated STS implements are both served.
 * `GetCallerIdentity` is the one a person reaches for to check that an
 * endpoint and a set of credentials are wired up as expected, and `AssumeRole`
 * hands back credentials that sign the requests the caller makes next.
 */
export function simStsApiEndpoint(simAws: SimAws): SimQueryApiEndpoint {
  return new SimQueryApiEndpoint({
    simAws,
    serviceId: "STS",
    namespace: stsNamespace,
    operations: simStsQueryOperations(),
  });
}

function simStsQueryOperations(): SimQueryOperations {
  return new Map([
    [
      "GetCallerIdentity",
      {
        input: (): Record<string, unknown> => ({}),
        result: (output): string =>
          queryMembers(output, ["UserId", "Account", "Arn"]),
      },
    ],
    [
      "AssumeRole",
      {
        input: (fields): Record<string, unknown> => ({
          RoleArn: fields.text("RoleArn"),
          RoleSessionName: fields.text("RoleSessionName"),
          DurationSeconds: fields.number("DurationSeconds"),
          ExternalId: fields.text("ExternalId"),
        }),
        result: (output): string =>
          queryStructure(output, "Credentials", (credentials) =>
            queryMembers(credentials, [
              "AccessKeyId",
              "SecretAccessKey",
              "SessionToken",
              "Expiration",
            ]),
          ) +
          queryStructure(output, "AssumedRoleUser", (user) =>
            queryMembers(user, ["Arn", "AssumedRoleId"]),
          ),
      },
    ],
  ]);
}
