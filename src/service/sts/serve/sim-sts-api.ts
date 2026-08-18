import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { SimSdkCommandDispatcher } from "../../../sdk/sim-sdk-command-dispatcher.js";
import {
  makeSimSdkWireClient,
  makeSimSdkWireCommand,
} from "../../../sdk/wire/sim-sdk-wire-command.js";
import { xmlValue } from "../../../util/xml/xml-writer.js";
import type { SimGetCallerIdentityCommandOutput } from "../command/get-caller-identity/get-caller-identity.command.js";
import { readSimStsQueryRequest } from "./sim-sts-query-request.js";
import {
  simStsQueryErrorResponse,
  simStsQueryResponse,
} from "./sim-sts-query-response.js";

/**
 * The SDK service id simulated STS's Command router is registered under.
 */
const stsServiceId = "STS";

interface SimStsApiEndpointProperties {
  readonly simAws: SimAws;
}

/**
 * Serves the STS API to a client given an endpoint URL.
 *
 * STS speaks the Query protocol, which names its operation in a form-encoded
 * `Action` field rather than in a header or a path. The operation is resolved
 * from that field and answered from the simulation, as the other served
 * protocols are, so an HTTP caller reaches the same code an in-process caller
 * does.
 */
export class SimStsApiEndpoint {
  private readonly dispatcher: SimSdkCommandDispatcher;

  constructor(properties: SimStsApiEndpointProperties) {
    this.dispatcher = new SimSdkCommandDispatcher(properties.simAws);
  }

  /**
   * Answer one STS Query request as the caller that signed it.
   */
  async handle(
    request: Request,
    body: Uint8Array,
    caller: SimAwsCaller,
    regionName: string,
  ): Promise<Response> {
    const query = readSimStsQueryRequest(request, body);
    if (query === undefined) {
      return simStsQueryErrorResponse(
        400,
        "MissingAction",
        "The request is missing an Action field, which every AWS Query protocol request states.",
      );
    }

    if (query.action !== "GetCallerIdentity") {
      return simStsQueryErrorResponse(
        501,
        "NotImplemented",
        `Simulated STS does not serve ${query.action}`,
      );
    }

    try {
      const identity = (await this.dispatcher.dispatch(
        makeSimSdkWireCommand(`${query.action}Command`, {}),
        makeSimSdkWireClient(stsServiceId, regionName),
        undefined,
        caller,
      )) as SimGetCallerIdentityCommandOutput;

      return simStsQueryResponse(query.action, callerIdentityResult(identity));
    } catch (error) {
      if (error instanceof SimIamAccessDenied) {
        return simStsQueryErrorResponse(403, "AccessDenied", error.message);
      }

      throw error;
    }
  }
}

/**
 * Write the members GetCallerIdentity answers with.
 */
function callerIdentityResult(
  identity: SimGetCallerIdentityCommandOutput,
): string {
  return (
    xmlValue("UserId", identity.UserId) +
    xmlValue("Account", identity.Account) +
    xmlValue("Arn", identity.Arn)
  );
}
