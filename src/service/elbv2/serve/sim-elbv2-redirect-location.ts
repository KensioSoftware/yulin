import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimElbV2RedirectActionConfig } from "../command/sim-elbv2-shared.command.js";

/**
 * The URI a request arrived at, in the five parts a redirect can reuse.
 */
export interface SimElbV2RequestUri {
  /** The protocol the listener taking the request speaks. */
  readonly protocol: string;
  /** The host name the request named, without any port. */
  readonly host: string;
  /** The port the listener taking the request answers on. */
  readonly port: string;
  /** The path of the request URL, with its leading slash. */
  readonly path: string;
  /** The query string of the request URL, without its leading question mark. */
  readonly query: string;
}

/**
 * The keywords a redirect can carry, which are the only ones substituted.
 */
const keywordPattern = /#\{(?:protocol|host|port|path|query)\}/gu;

/**
 * Builds the URI a `redirect` action sends the client to.
 *
 * A component the action does not name keeps the request's own value, so a
 * redirect that changes only the protocol still lands on the same path. The
 * five reserved keywords put a component back where the action names another,
 * and `#{path}` is the one with a shape of its own: it has the leading slash
 * removed, which is why leaving the path alone is written as `/#{path}`.
 *
 * The port is always in the URI, including when it is the protocol's own, which
 * is what real ELB sends. A redirect to HTTPS on 443 therefore answers with a
 * Location ending `:443`, and a test asserting on it is asserting on what a
 * client would really receive.
 */
export class SimElbV2RedirectLocation {
  private readonly keywords: ReadonlyMap<string, string>;

  constructor(original: SimElbV2RequestUri) {
    this.keywords = new Map([
      ["#{protocol}", original.protocol],
      ["#{host}", original.host],
      ["#{port}", original.port],
      ["#{path}", original.path.replace(/^\//u, "")],
      ["#{query}", original.query],
    ]);
  }

  /**
   * Build the Location one redirect action sends.
   */
  build(config: SimElbV2RedirectActionConfig): string {
    const protocol = this.substitute(config.Protocol ?? "#{protocol}");
    const host = this.substitute(config.Host ?? "#{host}");
    const port = this.substitute(config.Port ?? "#{port}");
    const path = this.substitute(config.Path ?? "/#{path}");
    const query = this.substitute(config.Query ?? "#{query}");

    // Lowercased, because ELB takes the protocol as HTTP or HTTPS and a URI
    // scheme is written in lower case.
    return `${protocol.toLowerCase()}://${host}:${port}${path}${this.queryPart(query)}`;
  }

  private substitute(component: string): string {
    return component.replaceAll(keywordPattern, (keyword) =>
      this.keyword(keyword),
    );
  }

  private keyword(keyword: string): string {
    const value = this.keywords.get(keyword);

    // The pattern matches only the five keywords the map was built with.
    assertDefined(value, `No sim ELBv2 redirect value for ${keyword}`);

    return value;
  }

  /**
   * The query string as the URI carries it, which is nothing when there is
   * none. The question mark is ELB's to add, which is why a configured query
   * does not carry one.
   */
  private queryPart(query: string): string {
    if (query === "") {
      return "";
    }

    return `?${query}`;
  }
}
