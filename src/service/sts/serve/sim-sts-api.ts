import type { SimAws } from "../../aws/sim-aws.js";
import { SimQueryApiEndpoint } from "../../../serve/http/api/query/sim-query-endpoint.js";
import type { SimQueryOperations } from "../../../serve/http/api/query/sim-query-operation.js";
import { queryMembers } from "../../../serve/http/api/query/sim-query-result.js";

/**
 * The XML namespace real STS stamps on every response it sends.
 */
const stsNamespace = "https://sts.amazonaws.com/doc/2011-06-15/";

/**
 * Serve the STS Query API to a client given an endpoint URL.
 *
 * `GetCallerIdentity` is the only operation simulated STS implements, and it
 * is the one a person reaches for to check that an endpoint and a set of
 * credentials are wired up as expected. `AssumeRole` is reachable in process
 * and through SDK interception.
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
  ]);
}
