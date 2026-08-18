import type { SimAwsCaller } from "../../../../service/aws/caller/sim-aws-caller.js";
import type { SimAws } from "../../../../service/aws/sim-aws.js";
import { SimSdkCommandDispatcher } from "../../../../sdk/sim-sdk-command-dispatcher.js";
import {
  makeSimSdkWireClient,
  makeSimSdkWireCommand,
} from "../../../../sdk/wire/sim-sdk-wire-command.js";
import type { SimQueryOperations } from "./sim-query-operation.js";
import { readSimQueryRequest } from "./sim-query-request.js";
import { SimQueryProtocol } from "./sim-query-response.js";
import type { SimQueryOutput } from "./sim-query-result.js";

interface SimQueryApiEndpointProperties {
  readonly simAws: SimAws;

  /** The SDK service id the simulated service's Command router is under. */
  readonly serviceId: string;

  /** The XML namespace this service stamps on every envelope it sends. */
  readonly namespace: string;

  readonly operations: SimQueryOperations;
}

/**
 * Serves one Query protocol service to a client given an endpoint URL.
 *
 * The Query protocol names its operation in a form-encoded `Action` field
 * rather than in a header or a path, and answers in an XML envelope named
 * after that operation. Both halves are the protocol rather than the service,
 * so every Query service is served by an instance of this, holding the
 * operations it implements.
 *
 * An operation runs through the Command an SDK would have sent, so an HTTP
 * caller reaches exactly the code an in-process caller does, and IAM
 * authorizes it the same way. The Query action names and the SDK Command names
 * are the same names, which is what lets one table serve both.
 */
export class SimQueryApiEndpoint {
  private readonly dispatcher: SimSdkCommandDispatcher;
  private readonly serviceId: string;
  private readonly operations: SimQueryOperations;
  private readonly protocol: SimQueryProtocol;

  constructor(properties: SimQueryApiEndpointProperties) {
    this.dispatcher = new SimSdkCommandDispatcher(properties.simAws);
    this.serviceId = properties.serviceId;
    this.operations = properties.operations;
    this.protocol = new SimQueryProtocol(properties.namespace);
  }

  /**
   * Answer one Query request as the caller that signed it.
   *
   * An operation this service does not implement is refused in the Query error
   * shape rather than left unanswered, so an SDK raises it by name instead of
   * failing to parse the response.
   */
  async handle(
    request: Request,
    body: Uint8Array,
    caller: SimAwsCaller,
    regionName: string,
  ): Promise<Response> {
    const query = readSimQueryRequest(request, body);
    if (query === undefined) {
      return this.protocol.error(
        400,
        "MissingAction",
        "The request is missing an Action field, which every AWS Query protocol request states.",
      );
    }

    const operation = this.operations.get(query.action);
    if (operation === undefined) {
      return this.protocol.error(
        501,
        "NotImplemented",
        `Simulated ${this.serviceId} does not serve ${query.action}`,
      );
    }

    try {
      const output = await this.dispatcher.dispatch(
        makeSimSdkWireCommand(
          `${query.action}Command`,
          operation.input(query.fields),
        ),
        makeSimSdkWireClient(this.serviceId, regionName),
        undefined,
        caller,
      );

      return this.protocol.response(
        query.action,
        operation.result((output ?? {}) as SimQueryOutput),
      );
    } catch (error) {
      return this.protocol.failure(error);
    }
  }
}
