import { readSimRestJsonBody } from "./sim-rest-json-request.js";

interface SimRestJsonInputProperties {
  readonly labels: ReadonlyMap<string, string>;
  readonly query: URLSearchParams;
  readonly headers: Headers;
  readonly body: Uint8Array;
}

/**
 * The four places a REST-JSON request states its input, behind one accessor.
 *
 * REST-JSON spreads one operation's members across a path, a query string,
 * headers and a JSON body, and which member goes where is the operation's own
 * business. An operation's route reads the members it has from wherever it put
 * them, and this is what it reads them with.
 */
export class SimRestJsonInput {
  readonly body: Uint8Array;

  private readonly labels: ReadonlyMap<string, string>;
  private readonly parameters: URLSearchParams;
  private readonly headers: Headers;

  constructor(properties: SimRestJsonInputProperties) {
    this.labels = properties.labels;
    this.parameters = properties.query;
    this.headers = properties.headers;
    this.body = properties.body;
  }

  /**
   * A member the path stated, named by the route template that matched it.
   */
  label(name: string): string | undefined {
    return this.labels.get(name);
  }

  /**
   * A member the query string stated.
   */
  query(name: string): string | undefined {
    return this.parameters.get(name) ?? undefined;
  }

  /**
   * A list member the query string stated, one parameter per item, which is
   * how REST-JSON puts a list in a query string.
   */
  queryAll(name: string): string[] {
    return this.parameters.getAll(name);
  }

  /**
   * A number member the query string stated. A value that is not a number is
   * passed on as one that fails validation, rather than dropped.
   */
  queryNumber(name: string): number | undefined {
    const value = this.query(name);

    return value === undefined ? undefined : Number(value);
  }

  /**
   * A member a header stated, matched however the client cased the name.
   */
  header(name: string): string | undefined {
    return this.headers.get(name) ?? undefined;
  }

  /**
   * The members the JSON body stated, which are the input shape as it is.
   *
   * The wire shape of a REST-JSON body is the Command input shape member for
   * member, apart from the members JSON cannot carry: a blob travels base64
   * encoded and a timestamp as epoch seconds. A route reading one of those
   * decodes it itself, since only the operation's own schema says which
   * members they are.
   */
  json(): Readonly<Record<string, unknown>> {
    return readSimRestJsonBody(this.body);
  }
}
