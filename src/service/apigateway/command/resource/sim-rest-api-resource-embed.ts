import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";

/**
 * The one thing `embed` can ask a resource response to carry.
 */
const methodsEmbed = "methods";

/**
 * What a resource response should carry beyond the resource itself.
 */
export interface SimRestApiResourceEmbed {
  readonly methods: boolean;
}

/**
 * Read the `embed` of a resource command, refusing anything it cannot build.
 *
 * Real API Gateway leaves the methods out of a resource response unless
 * `embed` asks for them. A caller reading them from an unembedded response
 * here would be reading something AWS never sends, so the option is honoured
 * rather than ignored.
 */
export function simRestApiResourceEmbedOf(
  operation: string,
  embed: readonly string[] | undefined,
): SimRestApiResourceEmbed {
  const asked = embed ?? [];
  const unsupported = asked.filter((one) => one !== methodsEmbed);

  if (unsupported.length > 0) {
    throw new SimApiGatewayBadRequest(
      `${operation} embed ${unsupported.map((one) => `'${one}'`).join(", ")} ` +
        `is not simulated. Only '${methodsEmbed}' is supported.`,
    );
  }

  return { methods: asked.includes(methodsEmbed) };
}
