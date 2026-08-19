import type { SimQueryFields } from "../../../../serve/http/api/query/sim-query-request.js";

/**
 * Read a numeric member back out of the text Query carries it as.
 *
 * ELB takes numbers everywhere: a listener port, a rule priority, a health
 * check interval, a page size. The simulation checks most of them are whole
 * numbers in range and refuses what is not, so a string handed straight on
 * would be refused as a number nobody sent.
 */
export function elbV2QueryNumber(
  fields: SimQueryFields,
  name: string,
): number | undefined {
  const value = fields.text(name);

  return value === undefined ? undefined : Number(value);
}

/**
 * Read the tags a create was asked to put on what it makes.
 */
export function elbV2QueryTags(
  fields: SimQueryFields,
): readonly Record<string, unknown>[] | undefined {
  return fields.list("Tags", (tag) => ({
    Key: tag.text("Key"),
    Value: tag.text("Value"),
  }));
}

/**
 * Read the paging a describe was asked for.
 *
 * ELB pages with a `Marker` in and a `NextMarker` out, rather than with the
 * `NextToken` most services use, and every describe takes the same two.
 */
export function elbV2QueryPagingInput(
  fields: SimQueryFields,
): Record<string, unknown> {
  return {
    Marker: fields.text("Marker"),
    PageSize: elbV2QueryNumber(fields, "PageSize"),
  };
}

/**
 * Read a list of values rather than of structures.
 *
 * The Query layer reads a list by handing each member its own fields, which
 * reaches the members of a structure. A list of plain values has none:
 * `Subnets.member.1` is the value itself. So the subscripts are walked from
 * one until the request stops stating them.
 *
 * That stops at a gap, where the Query layer's own list reader carries on. It
 * makes no difference to a request anything sends, since every AWS client
 * numbers a list from one without skipping, and it is the reason this belongs
 * in `SimQueryFields` alongside that reader rather than here.
 */
export function elbV2QueryValues(
  fields: SimQueryFields,
  name: string,
): readonly string[] | undefined {
  const values: string[] = [];
  let value = fields.text(`${name}.member.1`);

  while (value !== undefined) {
    values.push(value);
    value = fields.text(`${name}.member.${String(values.length + 1)}`);
  }

  return values.length === 0 ? undefined : values;
}

/**
 * The members read out of a nested structure, or nothing when the request
 * stated none of them.
 *
 * Query has no nesting on the wire, so a structure nobody sent and a structure
 * whose every member was left out read the same way. The two are different
 * requests: ELB reports a configuration back exactly as it was given one, and
 * an empty structure would appear in every describe of a listener that never
 * had one.
 */
export function elbV2QueryStated(
  members: Record<string, unknown>,
): Record<string, unknown> | undefined {
  return Object.values(members).some((member) => member !== undefined)
    ? members
    : undefined;
}
