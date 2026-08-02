import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbReadView } from "../../table/sim-dynamodb-read-view.js";

/**
 * The four things `Select` can ask a read for.
 */
const selectKinds = [
  "ALL_ATTRIBUTES",
  "ALL_PROJECTED_ATTRIBUTES",
  "SPECIFIC_ATTRIBUTES",
  "COUNT",
] as const;

type SimDynamoDbSelectKind = (typeof selectKinds)[number];

/**
 * What a table read defaults to when the request says nothing.
 *
 * A read of an index defaults to `ALL_PROJECTED_ATTRIBUTES` instead, since an
 * index carries only what it projects and cannot answer with more.
 */
const tableDefault: SimDynamoDbSelectKind = "ALL_ATTRIBUTES";

/**
 * The parts of a request `Select` is read against.
 *
 * Which attributes come back is written in three places that have to agree, so
 * the other two are read alongside it.
 */
export interface SimDynamoDbSelectInput {
  readonly Select?: string | undefined;
  readonly ProjectionExpression?: string | undefined;
  readonly AttributesToGet?: readonly string[] | undefined;
  readonly IndexName?: string | undefined;
}

/**
 * Which attributes a query or a scan answers with.
 *
 * `Select` and the projection a request carries have to say the same thing, and
 * DynamoDB refuses the pairs that do not. That check is worth making whether or
 * not projecting a read is simulated, since a request the service would refuse
 * should be refused here too.
 */
export class SimDynamoDbSelect {
  private readonly kind: SimDynamoDbSelectKind;

  private constructor(kind: SimDynamoDbSelectKind) {
    this.kind = kind;
  }

  /**
   * Read the `Select` a request asks for, refusing one that contradicts the
   * rest of the request.
   */
  static from(input: SimDynamoDbSelectInput): SimDynamoDbSelect {
    const kind = readSelectKind(input);

    assertIndexToProjectFrom(kind, input);
    assertProjectionAgrees(kind, input);

    return new this(kind);
  }

  /**
   * Refuse a `Select` the view being read cannot answer.
   *
   * Only the view knows which attributes it carries, so this waits for it where
   * the rest of the `Select` rules are about the request on its own.
   */
  assertAnswerableBy(view: SimDynamoDbReadView): void {
    if (this.kind === "ALL_ATTRIBUTES") {
      view.assertCarriesWholeItem();
    }
  }

  /**
   * Whether the read answers with whole items rather than what the view holds.
   *
   * `ALL_ATTRIBUTES` is the one `Select` that can ask for more than an index
   * carries. A view that cannot answer it has refused the read already in
   * `assertAnswerableBy`, so by the time this is asked the whole item is there
   * to answer with. On a local secondary index that is the base table fetch AWS
   * charges the extra read capacity for; here the item was already to hand.
   */
  get wholeItems(): boolean {
    return this.kind === "ALL_ATTRIBUTES";
  }

  /**
   * Whether the read answers with counts alone.
   *
   * `COUNT` leaves out `Items` rather than answering with an empty list, so a
   * caller reading the items of a counted page finds nothing there.
   */
  get countsOnly(): boolean {
    return this.kind === "COUNT";
  }
}

/**
 * Read the `Select` a request wrote, refusing a word that is not one.
 *
 * A request that wrote none defaults by what it is reading: whole items from a
 * table, and what the index projects from an index.
 */
function readSelectKind(input: SimDynamoDbSelectInput): SimDynamoDbSelectKind {
  const select = input.Select;

  if (select === undefined) {
    if (input.IndexName === undefined) {
      return tableDefault;
    }

    return "ALL_PROJECTED_ATTRIBUTES";
  }

  const kind = selectKinds.find((candidate) => candidate === select);

  if (kind === undefined) {
    throw new SimDynamoDbValidationException(
      `Select ${select} is not one of ${selectKinds.join(", ")}`,
    );
  }

  return kind;
}

/**
 * Refuse a read asking for what an index projects when it reads no index.
 */
function assertIndexToProjectFrom(
  kind: SimDynamoDbSelectKind,
  input: SimDynamoDbSelectInput,
): void {
  if (kind === "ALL_PROJECTED_ATTRIBUTES" && input.IndexName === undefined) {
    throw new SimDynamoDbValidationException(
      `Select ALL_PROJECTED_ATTRIBUTES answers with the attributes an index ` +
        `projects, and this request names no IndexName. A table read takes ` +
        `${tableDefault}.`,
    );
  }
}

/**
 * Refuse a `Select` and a projection that do not say the same thing.
 *
 * `SPECIFIC_ATTRIBUTES` is the one that projects, so it is the only one a
 * projection goes with, and it needs one to have anything to answer with.
 * `AttributesToGet` counts as a projection here as it does on AWS, which leaves
 * a request using it refused by name rather than for a missing
 * `ProjectionExpression` it never meant to write.
 *
 * A request that writes a projection and no `Select` at all is asking for
 * exactly one thing, so there is nothing for it to contradict.
 */
function assertProjectionAgrees(
  kind: SimDynamoDbSelectKind,
  input: SimDynamoDbSelectInput,
): void {
  if (input.Select === undefined) {
    return;
  }

  const projects =
    input.ProjectionExpression !== undefined ||
    (input.AttributesToGet ?? []).length > 0;

  if (kind === "SPECIFIC_ATTRIBUTES" && !projects) {
    throw new SimDynamoDbValidationException(
      `Select SPECIFIC_ATTRIBUTES answers with the attributes a ` +
        `ProjectionExpression names, and this request carries none`,
    );
  }

  if (kind === "SPECIFIC_ATTRIBUTES") {
    return;
  }

  if (input.ProjectionExpression !== undefined) {
    throw new SimDynamoDbValidationException(
      `Select ${kind} cannot be combined with a ProjectionExpression. ` +
        `SPECIFIC_ATTRIBUTES is the Select that answers with the attributes ` +
        `a projection names.`,
    );
  }
}
