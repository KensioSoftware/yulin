import type { SimAws } from "../../aws/sim-aws.js";
import { SimQueryApiEndpoint } from "../../../serve/http/api/query/sim-query-endpoint.js";
import type { SimQueryOperations } from "../../../serve/http/api/query/sim-query-operation.js";
import { simIamQueryPolicyOperations } from "./sim-iam-query-policy-operations.js";
import { simIamQueryRoleOperations } from "./sim-iam-query-role-operations.js";
import { simIamQueryUserOperations } from "./sim-iam-query-user-operations.js";

/**
 * The XML namespace real IAM stamps on every response it sends.
 */
const iamNamespace = "https://iam.amazonaws.com/doc/2010-05-08/";

/**
 * Serve the IAM Query API to a client given an endpoint URL.
 *
 * Every served request is authorized as the principal that signed it, so until
 * IAM answers here, a caller outside the process that built the simulation had
 * no way to be anybody. Creating a User and asking for its access key are the
 * two operations that break that circle: a container or a shell script sets
 * itself up over the endpoint and then signs the rest of its requests with
 * what it was answered.
 *
 * The operations served are the ones simulated IAM implements. Anything else
 * is refused as `NotImplemented`, under that name rather than as an
 * unparseable response.
 */
export function simIamApiEndpoint(simAws: SimAws): SimQueryApiEndpoint {
  return new SimQueryApiEndpoint({
    simAws,
    serviceId: "IAM",
    namespace: iamNamespace,
    operations: simIamQueryOperations(),
  });
}

function simIamQueryOperations(): SimQueryOperations {
  return new Map([
    ...simIamQueryUserOperations(),
    ...simIamQueryRoleOperations(),
    ...simIamQueryPolicyOperations(),
  ]);
}
