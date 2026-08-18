/**
 * One AWS Query protocol request, as the form encoding carries it.
 *
 * Query is the oldest of the AWS protocols. It states the operation in an
 * `Action` field and its input in the same form encoding, either in the body
 * of a POST or in the query string of a GET.
 */
export interface SimQueryRequest {
  readonly action: string;
  readonly fields: SimQueryFields;
}

/**
 * Read a request as the Query protocol operation it names.
 *
 * Returns undefined when no `Action` is stated, which is what separates a
 * Query request from anything else that reached the endpoint.
 */
export function readSimQueryRequest(
  request: Request,
  body: Uint8Array,
): SimQueryRequest | undefined {
  const fields = queryFields(request, body);
  const action = fields.get("Action");

  return action === null || action.length === 0
    ? undefined
    : { action, fields: new SimQueryFields(fields) };
}

/**
 * The fields of one Query request, or of one structure inside it.
 *
 * Query has no nesting on the wire. A structure states its members under a
 * dotted prefix, a list repeats a numbered `member` segment and a map repeats
 * a numbered `entry` segment, so `Tags.member.2.Key` is the key of the second
 * tag. Reading that back is a matter of knowing which prefix is in play, and an
 * instance of this holds one. The whole request is the empty prefix, and each
 * list member or map entry is the same fields under a longer one.
 */
export class SimQueryFields {
  private readonly fields: URLSearchParams;
  private readonly prefix: string;

  constructor(fields: URLSearchParams, prefix = "") {
    this.fields = fields;
    this.prefix = prefix;
  }

  /**
   * One string member, or nothing when the request did not state it.
   */
  text(name: string): string | undefined {
    return this.fields.get(`${this.prefix}${name}`) ?? undefined;
  }

  /**
   * One boolean member, which Query spells out as `true` or `false`.
   */
  flag(name: string): boolean | undefined {
    const value = this.text(name);

    return value === undefined ? undefined : value === "true";
  }

  /**
   * One blob member, which Query carries as base64 text.
   */
  binary(name: string): Uint8Array | undefined {
    const value = this.text(name);

    return value === undefined ? undefined : Buffer.from(value, "base64");
  }

  /**
   * The members of a list, read one at a time from the fields under each
   * subscript.
   *
   * A list nobody stated is nothing rather than an empty list. The two are
   * different requests, and a simulated service refusing a member it does not
   * implement has to tell a request that omitted it from one that sent it
   * empty.
   */
  list<Value>(
    name: string,
    read: (member: SimQueryFields) => Value,
  ): readonly Value[] | undefined {
    const members = this.subscripts(name, "member");

    return members.length === 0 ? undefined : members.map(read);
  }

  /**
   * The entries of a map, each as the fields under its own subscript.
   */
  entries(name: string): readonly SimQueryFields[] {
    return this.subscripts(name, "entry");
  }

  /**
   * A map of strings to strings, which is the shape every attribute member of
   * a Query request has.
   *
   * An entry stating no key is dropped rather than held under an empty one,
   * since there is no attribute it could be naming.
   */
  attributes(name: string): Record<string, string> | undefined {
    const entries = this.entries(name);
    if (entries.length === 0) {
      return undefined;
    }

    const named = entries
      .map((entry) => ({ key: entry.text("key"), value: entry.text("value") }))
      .filter((entry) => entry.key !== undefined && entry.key.length > 0);

    return Object.fromEntries(
      named.map((entry) => [entry.key ?? "", entry.value ?? ""]),
    );
  }

  /**
   * The subscripted prefixes a list or a map states under this one.
   *
   * The subscripts are read off the field names rather than counted up from
   * one, because a request that skips a number is still a request, and they
   * are ordered numerically so the list arrives in the order it was written
   * rather than the order the form encoding happens to carry.
   */
  private subscripts(name: string, wrapper: string): readonly SimQueryFields[] {
    const start = `${this.prefix}${name}.${wrapper}.`;
    const subscripts = new Set<string>();

    for (const field of this.fields.keys()) {
      if (field.startsWith(start)) {
        subscripts.add(field.slice(start.length).split(".", 1)[0] ?? "");
      }
    }

    return [...subscripts]
      .toSorted((one, other) => Number(one) - Number(other))
      .map(
        (subscript) => new SimQueryFields(this.fields, `${start}${subscript}.`),
      );
  }
}

/**
 * The form-encoded fields a request carried, wherever it put them.
 *
 * A POST carries them in the body and a GET in the query string, and the
 * `aws` CLI sends a POST while a browser or a hand-written GET sends the
 * other. Both are read so that neither has to be the supported one.
 */
function queryFields(request: Request, body: Uint8Array): URLSearchParams {
  if (body.byteLength > 0) {
    return new URLSearchParams(Buffer.from(body).toString("utf8"));
  }

  return new URL(request.url).searchParams;
}
