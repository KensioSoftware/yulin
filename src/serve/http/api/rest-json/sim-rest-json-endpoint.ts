import { SimSdkUnsupportedCommandError } from "../../../../sdk/error/sim-sdk.error.js";
import { SimSdkCommandDispatcher } from "../../../../sdk/sim-sdk-command-dispatcher.js";
import {
  makeSimSdkWireClient,
  makeSimSdkWireCommand,
} from "../../../../sdk/wire/sim-sdk-wire-command.js";
import type { SimAwsCaller } from "../../../../service/aws/caller/sim-aws-caller.js";
import type { SimAws } from "../../../../service/aws/sim-aws.js";
import { SimRestJsonInput } from "./sim-rest-json-input.js";
import { readSimRestJsonRequest } from "./sim-rest-json-request.js";
import { SimRestJsonProtocol } from "./sim-rest-json-response.js";
import type {
  SimRestJsonOutput,
  SimRestJsonRoute,
} from "./sim-rest-json-route.type.js";
import { resolveSimRestJsonRoute } from "./sim-rest-json-routes.js";

interface SimRestJsonApiEndpointProperties {
  readonly simAws: SimAws;

  /** The SDK service id the simulated service's Command router is under. */
  readonly serviceId: string;

  readonly routes: readonly SimRestJsonRoute[];
}

/**
 * Serves one REST-JSON service to a client given an endpoint URL.
 *
 * REST-JSON names its operation in the method and the path rather than in a
 * header, so the operation is resolved from the request before anything else.
 * Both the routing and the JSON on either side of it are the protocol rather
 * than the service, so every REST-JSON service is served by an instance of
 * this, holding the routes it implements.
 *
 * An operation runs through the Command an SDK would have sent, so an HTTP
 * caller reaches exactly the code an in-process caller does, and IAM
 * authorizes it the same way.
 */
export class SimRestJsonApiEndpoint {
  private readonly dispatcher: SimSdkCommandDispatcher;
  private readonly serviceId: string;
  private readonly routes: readonly SimRestJsonRoute[];
  private readonly protocol = new SimRestJsonProtocol();

  constructor(properties: SimRestJsonApiEndpointProperties) {
    this.dispatcher = new SimSdkCommandDispatcher(properties.simAws);
    this.serviceId = properties.serviceId;
    this.routes = properties.routes;
  }

  /**
   * Answer one REST-JSON request as the caller that signed it.
   *
   * A path no route serves is refused by name rather than answered by an
   * operation that shares its method. Ignoring the difference would answer a
   * question about one thing with a confident report about another, which is
   * worse than saying so.
   */
  async handle(
    request: Request,
    body: Uint8Array,
    caller: SimAwsCaller,
    regionName: string,
  ): Promise<Response> {
    const restRequest = readSimRestJsonRequest(request, body);
    const matched = resolveSimRestJsonRoute(this.routes, restRequest);
    if (matched === undefined) {
      return this.protocol.error(
        501,
        "NotImplemented",
        `Simulated ${this.serviceId} does not serve ` +
          `${restRequest.method} ${restRequest.path}`,
      );
    }

    const { route } = matched;
    try {
      const input = route.input(
        new SimRestJsonInput({
          labels: matched.labels,
          query: restRequest.query,
          headers: restRequest.headers,
          body: restRequest.body,
        }),
      );

      const output = (await this.dispatcher.dispatch(
        makeSimSdkWireCommand(route.commandName, input),
        makeSimSdkWireClient(this.serviceId, regionName),
        undefined,
        caller,
      )) as SimRestJsonOutput | undefined;

      return route.output === undefined
        ? this.protocol.response(output ?? {}, route.status ?? 200)
        : route.output(output ?? {});
    } catch (error) {
      if (error instanceof SimSdkUnsupportedCommandError) {
        return this.protocol.error(501, "NotImplemented", error.message);
      }

      return this.protocol.failure(error);
    }
  }
}
