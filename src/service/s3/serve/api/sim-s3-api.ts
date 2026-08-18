import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import { SimSdkUnsupportedCommandError } from "../../../../sdk/error/sim-sdk.error.js";
import { SimSdkCommandDispatcher } from "../../../../sdk/sim-sdk-command-dispatcher.js";
import {
  makeSimSdkWireClient,
  makeSimSdkWireCommand,
} from "../../../../sdk/wire/sim-sdk-wire-command.js";
import { SimS3RestErrorResponse } from "../sim-s3-rest-error-response.js";
import { simS3ApiResponse } from "./sim-s3-api-output.js";
import { readSimS3ApiRequest } from "./sim-s3-api-request.js";
import {
  resolveSimS3ApiRoute,
  simS3UnservedSubResource,
} from "./sim-s3-api-routes.js";

/**
 * The SDK service id simulated S3's Command router is registered under.
 */
const s3ServiceId = "S3";

interface SimS3ApiEndpointProperties {
  readonly simAws: SimAws;
}

/**
 * Serves the S3 REST API to a client given an endpoint URL.
 *
 * S3 states its operation in the method, the path and a query-string
 * sub-resource rather than in a header, so the operation is resolved from the
 * request before anything else. What happens after that is the same as for
 * every other served AWS API request: the operation runs through the Command
 * the SDK would have sent, so an HTTP caller reaches exactly the code an
 * in-process caller does, and IAM authorizes it the same way.
 */
export class SimS3ApiEndpoint {
  private readonly dispatcher: SimSdkCommandDispatcher;

  constructor(properties: SimS3ApiEndpointProperties) {
    this.dispatcher = new SimSdkCommandDispatcher(properties.simAws);
  }

  /**
   * Answer one S3 REST request as the caller that signed it.
   *
   * The Region is the one the request was signed for, read from its credential
   * scope, so it arrives as whatever the client wrote rather than as a Region
   * the simulator has already recognised.
   */
  async handle(
    request: Request,
    body: Uint8Array,
    caller: SimAwsCaller,
    regionName: string,
  ): Promise<Response> {
    const apiRequest = readSimS3ApiRequest(request, body);
    const errors = new SimS3RestErrorResponse({
      bucketName: apiRequest.bucketName,
      objectKey: apiRequest.objectKey,
    });

    const unserved = simS3UnservedSubResource(apiRequest);
    if (unserved !== undefined) {
      return errors.notImplemented(
        `Simulated S3 does not serve the ${unserved} sub-resource`,
      );
    }

    const route = resolveSimS3ApiRoute(apiRequest);
    if (route === undefined) {
      return errors.notImplemented(
        `Simulated S3 does not serve ${apiRequest.method} ${new URL(request.url).pathname}`,
      );
    }

    try {
      const output = await this.dispatcher.dispatch(
        makeSimSdkWireCommand(route.commandName, route.input(apiRequest)),
        makeSimSdkWireClient(s3ServiceId, regionName),
        undefined,
        caller,
      );

      return await simS3ApiResponse(route.commandName, output);
    } catch (error) {
      if (error instanceof SimSdkUnsupportedCommandError) {
        return errors.notImplemented(error.message);
      }

      return errors.build(error);
    }
  }
}
