/**
 * An SDK request handler that answers from the simulation's wire dispatcher.
 *
 * A client given this as its `requestHandler` serializes and signs each
 * Command as it would for real AWS, and deserializes whatever the dispatcher
 * answers. Nothing reaches the simulated service that the request body does
 * not carry, which is the round trip function code bundling its own SDK
 * makes. This lives under `test/` so that several test files can share it.
 */

import type { HttpRequest, HttpResponse } from "@smithy/types";

import type { SimAws } from "../../../src/service/aws/sim-aws.js";
import { SimSdkWireDispatcher } from "../../../src/sdk/wire/sim-sdk-wire-dispatcher.js";

/**
 * The parts of a client configuration that send it over the wire to the
 * simulation: a Region, static credentials to sign with, and the handler.
 */
export interface SimSdkWireClientConfig {
  readonly region: string;
  readonly credentials: {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
  };
  readonly requestHandler: {
    handle(request: HttpRequest): Promise<{ response: HttpResponse }>;
  };
}

/**
 * Client configuration that sends every request through the simulation's
 * wire dispatcher.
 */
export function simSdkWireClientConfig(
  simAws: SimAws,
  region = "eu-west-2",
): SimSdkWireClientConfig {
  const dispatcher = new SimSdkWireDispatcher(simAws);

  return {
    region,
    credentials: { accessKeyId: "AKIAEXAMPLE", secretAccessKey: "secret" },
    requestHandler: {
      async handle(request: HttpRequest): Promise<{ response: HttpResponse }> {
        const response = await dispatcher.dispatch({
          method: request.method,
          hostname: request.hostname,
          path: request.path,
          headers: Object.fromEntries(
            Object.entries(request.headers).map(([name, value]) => [
              name.toLowerCase(),
              value,
            ]),
          ),
          body: Buffer.from(String(request.body ?? "")),
        });

        return {
          response: {
            statusCode: response.statusCode,
            headers: { ...response.headers },
            body: response.body,
          },
        };
      },
    },
  };
}
