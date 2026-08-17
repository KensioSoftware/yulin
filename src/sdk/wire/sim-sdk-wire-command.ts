/**
 * Build the SDK Command a wire request was serialized from.
 *
 * Command routing is by Command class name and Command input, so a Command
 * rebuilt with the name the request named and the input it carried routes to
 * exactly the operation the real Command would have. Constructing the SDK's own
 * Command class instead would mean requiring the client package for every
 * service a bundled function might call, to end up at the same two values.
 */
export function makeSimSdkWireCommand(
  commandName: string,
  input: unknown,
): object {
  class SimSdkWireCommand {
    constructor(public readonly input: unknown) {}
  }
  Object.defineProperty(SimSdkWireCommand, "name", { value: commandName });

  return new SimSdkWireCommand(input);
}

/**
 * Build the SDK client a wire request would have been sent by.
 *
 * The dispatcher reads only the resolved service identity and Region from a
 * client, which the request states itself: the service in its operation header
 * and the Region in its credential scope. Nothing else about a client survives
 * serialization, and nothing else is needed.
 */
export function makeSimSdkWireClient(
  serviceId: string,
  regionName: string,
): object {
  return { config: { serviceId, region: regionName } };
}
