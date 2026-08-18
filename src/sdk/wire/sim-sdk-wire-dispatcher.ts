import type { SimAwsCaller } from "../../service/aws/caller/sim-aws-caller.js";
import type { AwsRegionName } from "../../service/aws/sim-aws-region.js";
import type { SimAws } from "../../service/aws/sim-aws.js";
import { SimSdkCommandDispatcher } from "../sim-sdk-command-dispatcher.js";
import {
  makeSimSdkWireClient,
  makeSimSdkWireCommand,
} from "./sim-sdk-wire-command.js";
import { readSimSdkWireInput } from "./sim-sdk-wire-json.js";
import {
  readSimSdkWireCredentialScope,
  readSimSdkWireOperation,
} from "./sim-sdk-wire-operation.js";
import {
  simSdkWireErrorResponse,
  simSdkWireOutputResponse,
} from "./sim-sdk-wire-response.js";
import { simSdkUnbridgedWireRequest } from "./sim-sdk-wire-unbridged.js";
import type {
  SimSdkWireRequest,
  SimSdkWireResponse,
} from "./sim-sdk-wire.types.js";

/**
 * Dispatches AWS API requests to simulated AWS service operations.
 *
 * This is SDK interception below the module boundary: where the module
 * interceptor patches a client class before the SDK serializes anything, this
 * reads a request the SDK has already serialized and signed, and routes it to
 * the same simulated operation. That is what a deployment package bundling the
 * SDK leaves available, and it is also closer to how the real thing works, in
 * that the simulation answers a request rather than replacing a client.
 *
 * The Account/Region scope and the caller are resolved per request by the same
 * dispatcher an intercepted client uses, so an ambient caller such as a sim
 * Lambda execution role applies here in exactly the same way.
 */
export class SimSdkWireDispatcher {
  private readonly dispatcher: SimSdkCommandDispatcher;
  private readonly regionName: AwsRegionName;

  /**
   * The fallback Region answers a request whose credential scope names none,
   * and is the Region the code making the request is running in.
   */
  constructor(simAws: SimAws, fallbackRegionName?: AwsRegionName) {
    this.dispatcher = new SimSdkCommandDispatcher(simAws);
    this.regionName = fallbackRegionName ?? simAws.defaultRegionName;
  }

  /**
   * Answer one AWS API request from the simulation.
   *
   * A request the simulation refuses comes back as the failure response real
   * AWS would send, because that is an answer: the SDK that sent it will turn
   * it back into the exception the calling code expects to catch. Only a
   * request that cannot be routed at all is thrown, since there is no response
   * that would mean what happened.
   *
   * A caller is passed when something has already authenticated the request,
   * as a served endpoint does by verifying its signature. Without one the
   * ambient run-as caller applies, which is what a sim Lambda's outbound call
   * relies on.
   */
  async dispatch(
    request: SimSdkWireRequest,
    caller?: SimAwsCaller,
  ): Promise<SimSdkWireResponse> {
    const operation = readSimSdkWireOperation(request);
    if (operation === undefined) {
      throw simSdkUnbridgedWireRequest(request);
    }

    // The operation runs in the Region it was signed for or, unsigned, the
    // Region of the code that sent it.
    const scope = readSimSdkWireCredentialScope(request);
    const contentType = request.headers["content-type"];

    try {
      const output = await this.dispatcher.dispatch(
        makeSimSdkWireCommand(
          operation.commandName,
          readSimSdkWireInput(request.body),
        ),
        makeSimSdkWireClient(
          operation.serviceId,
          scope?.regionName ?? this.regionName,
        ),
        undefined,
        caller,
      );

      return simSdkWireOutputResponse(output, contentType);
    } catch (error) {
      return simSdkWireErrorResponse(error, contentType);
    }
  }
}
