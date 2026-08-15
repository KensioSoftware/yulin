import type { SimElbV2RedirectActionConfig } from "../command/sim-elbv2-shared.command.js";
import { SimElbV2ValidationError } from "../error/sim-elbv2.error.js";

/**
 * The status codes real ELB takes on a redirect action.
 */
const statusCodes = new Set(["HTTP_301", "HTTP_302"]);

/**
 * The keyword each component of the URI is written as to keep the request's
 * own value.
 *
 * The path carries its leading slash and the keyword does not, which is why
 * keeping the path is written with one in front of it.
 */
const keywords = {
  protocol: "#{protocol}",
  host: "#{host}",
  port: "#{port}",
  path: "/#{path}",
} as const;

/**
 * What real ELB takes as a redirect's protocol.
 */
const protocols = /^(?:HTTPS?|#\{protocol\})$/u;

/**
 * What real ELB takes as a redirect's port, which is a port number or the
 * keyword leaving the request's own.
 */
function isPort(value: string): boolean {
  if (value === keywords.port) {
    return true;
  }

  const port = Number(value);

  return /^\d+$/u.test(value) && port >= 1 && port <= 65_535;
}

/**
 * Whether a redirect changes any part of the URI it was sent.
 *
 * Real ELB requires the protocol, host, port or path to be modified, since a
 * redirect to the request's own URI is a loop. Each component is paired with
 * the keyword that leaves it as it was, so naming one of those is not a
 * change. The query is absent from the list because changing it alone still
 * leaves the loop.
 */
function modifiesUri(config: SimElbV2RedirectActionConfig): boolean {
  const components: readonly (readonly [string | undefined, string])[] = [
    [config.Protocol, keywords.protocol],
    [config.Host, keywords.host],
    [config.Port, keywords.port],
    [config.Path, keywords.path],
  ];

  return components.some(
    ([value, unchanged]) => value !== undefined && value !== unchanged,
  );
}

/**
 * Check the parts of a redirect one at a time, refusing what ELB refuses.
 */
function requireComponents(
  config: SimElbV2RedirectActionConfig,
  field: string,
): void {
  if (config.Protocol !== undefined && !protocols.test(config.Protocol)) {
    throw new SimElbV2ValidationError(
      `${field} redirect action Protocol must be HTTP, HTTPS or ${keywords.protocol}`,
    );
  }

  if (config.Port !== undefined && !isPort(config.Port)) {
    throw new SimElbV2ValidationError(
      `${field} redirect action Port must be a number from 1 to 65535 or ${
        keywords.port
      }`,
    );
  }

  if (config.Path !== undefined && !config.Path.startsWith("/")) {
    throw new SimElbV2ValidationError(
      `${field} redirect action Path must start with a '/', as an absolute ` +
        `path does. Keeping the request's own path is ${keywords.path}.`,
    );
  }
}

/**
 * Check a redirect configuration, refusing one ELB would not take.
 */
export function requireSimElbV2RedirectConfig(
  config: SimElbV2RedirectActionConfig | undefined,
  field: string,
): void {
  if (config?.StatusCode === undefined || !statusCodes.has(config.StatusCode)) {
    throw new SimElbV2ValidationError(
      `${field} redirect action requires a RedirectConfig StatusCode of ${statusCodes
        .values()
        .toArray()
        .join(" or ")}`,
    );
  }

  requireComponents(config, field);

  if (!modifiesUri(config)) {
    throw new SimElbV2ValidationError(
      `${field} redirect action changes no part of the request URI, so it ` +
        `redirects to itself. Name a Protocol, Host, Port or Path.`,
    );
  }
}
