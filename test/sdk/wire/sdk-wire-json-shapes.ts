/**
 * Derives, from the AWS SDK client packages, which Command input members the
 * AWS JSON protocol wire bridge has to decode: the blobs, which travel as
 * base64 text, and the timestamps, which travel as numbers.
 *
 * The bridge itself cannot read the SDK schemas, because implementation code
 * under `src/` never imports `@aws-sdk/*`. It reads a committed snapshot of
 * this derivation instead. `scripts/mts/write-sdk-wire-json-shapes.mts` writes
 * the snapshot, and a test compares it with a fresh derivation, so an SDK
 * update that adds a blob member fails the suite until the snapshot moves on.
 *
 * This lives under `test/` because it imports the SDK clients and is shared by
 * a script and a test. `test/**` is type-checked, excluded from the published
 * build and not counted in coverage.
 */

import { NormalizedSchema } from "@smithy/core/schema";

/**
 * How one member is encoded on the wire, in the snapshot's notation.
 *
 * `blob` and `timestamp` are the two leaf kinds. `list:<kind>` and
 * `map:<kind>` wrap the kind of each element or value. `#<Shape>` names a
 * structure or union in the same service's `shapes`, which is how recursive
 * shapes such as DynamoDB's `AttributeValue` are written down.
 */
export type SdkWireJsonMemberKind = string;

/**
 * The members of one structure that need decoding, by member name.
 */
export type SdkWireJsonShape = Readonly<Record<string, SdkWireJsonMemberKind>>;

/**
 * One service's operations whose input needs decoding, and the shapes they
 * reach.
 */
export interface SdkWireJsonService {
  /** The input structure of each operation, by operation name. */
  readonly operations: Readonly<Record<string, string>>;
  readonly shapes: Readonly<Record<string, SdkWireJsonShape>>;
}

/**
 * The whole snapshot, keyed by SDK `config.serviceId`.
 */
export type SdkWireJsonShapes = Readonly<Record<string, SdkWireJsonService>>;

/**
 * The client package of every service the wire bridge reads a JSON body for,
 * keyed by SDK `config.serviceId`.
 *
 * Bedrock Runtime speaks REST-JSON, but its `Converse` operations send their
 * input as a JSON body as well, and go through the same reader.
 */
const clientModules: Readonly<Record<string, () => Promise<object>>> = {
  ACM: async () => await import("@aws-sdk/client-acm"),
  Athena: async () => await import("@aws-sdk/client-athena"),
  "Bedrock Runtime": async () =>
    await import("@aws-sdk/client-bedrock-runtime"),
  CloudWatch: async () => await import("@aws-sdk/client-cloudwatch"),
  "CloudWatch Logs": async () =>
    await import("@aws-sdk/client-cloudwatch-logs"),
  "Cognito Identity Provider": async () =>
    await import("@aws-sdk/client-cognito-identity-provider"),
  DynamoDB: async () => await import("@aws-sdk/client-dynamodb"),
  "DynamoDB Streams": async () =>
    await import("@aws-sdk/client-dynamodb-streams"),
  ECS: async () => await import("@aws-sdk/client-ecs"),
  EventBridge: async () => await import("@aws-sdk/client-eventbridge"),
  Firehose: async () => await import("@aws-sdk/client-firehose"),
  Glue: async () => await import("@aws-sdk/client-glue"),
  KMS: async () => await import("@aws-sdk/client-kms"),
  Kinesis: async () => await import("@aws-sdk/client-kinesis"),
  Personalize: async () => await import("@aws-sdk/client-personalize"),
  Rekognition: async () => await import("@aws-sdk/client-rekognition"),
  SFN: async () => await import("@aws-sdk/client-sfn"),
  SQS: async () => await import("@aws-sdk/client-sqs"),
  SSM: async () => await import("@aws-sdk/client-ssm"),
  "Secrets Manager": async () =>
    await import("@aws-sdk/client-secrets-manager"),
};

/**
 * The member traits that put a member somewhere other than the JSON body.
 * Only Bedrock Runtime's REST-JSON operations carry them.
 */
const outOfBodyTraits = ["httpHeader", "httpLabel", "httpQuery", "httpPayload"];

/**
 * Derive the snapshot from the installed SDK client packages.
 */
export async function deriveSdkWireJsonShapes(): Promise<SdkWireJsonShapes> {
  const services = await Promise.all(
    Object.entries(clientModules).map(
      async ([serviceId, load]) =>
        [
          serviceId,
          new SdkWireJsonServiceDerivation(await load()).derive(),
        ] as const,
    ),
  );

  return Object.fromEntries(services);
}

/**
 * The operation schemas a client package exports, as `[9, namespace, name,
 * traits, input, output]` tuples.
 */
function operationSchemas(
  clientModule: object,
): readonly (readonly [string, unknown])[] {
  return Object.values(clientModule).flatMap((value: unknown) => {
    if (!Array.isArray(value) || value[0] !== 9) {
      return [];
    }

    return [[String(value[2]), value[4]] as const];
  });
}

/**
 * Walks one service's operation inputs, collecting every structure they reach
 * with the kind of each member, then keeps only what leads to a blob or a
 * timestamp.
 */
class SdkWireJsonServiceDerivation {
  private readonly clientModule: object;
  private readonly allShapes = new Map<string, Map<string, string>>();

  constructor(clientModule: object) {
    this.clientModule = clientModule;
  }

  derive(): SdkWireJsonService {
    const inputs = operationSchemas(this.clientModule).map(
      ([operationName, input]) =>
        [
          operationName,
          this.kind(NormalizedSchema.of(input as never)),
        ] as const,
    );
    const relevant = this.relevantShapes();
    const keep = (kind: string | undefined): kind is string =>
      kind !== undefined && this.leadsToDecoding(kind, relevant);

    const operations = inputs
      .filter(([, kind]) => keep(kind))
      .map(([name, kind]) => [name, String(kind).slice(1)] as const)
      .toSorted(([a], [b]) => a.localeCompare(b));
    const shapes = [...relevant]
      .toSorted((a, b) => a.localeCompare(b))
      .map((shapeName) => {
        const members = [...(this.allShapes.get(shapeName) ?? [])]
          .filter(([, kind]) => keep(kind))
          .toSorted(([a], [b]) => a.localeCompare(b));

        return [shapeName, Object.fromEntries(members)] as const;
      });

    return {
      operations: Object.fromEntries(operations),
      shapes: Object.fromEntries(shapes),
    };
  }

  /**
   * The kind of a schema in the snapshot's notation, or undefined for one
   * that never needs decoding.
   */
  private kind(schema: NormalizedSchema): string | undefined {
    if (schema.isBlobSchema() && !schema.isStreaming()) {
      return "blob";
    }
    if (schema.isTimestampSchema()) {
      return "timestamp";
    }
    if (schema.isListSchema()) {
      return this.wrapped("list", schema.getValueSchema());
    }
    if (schema.isMapSchema()) {
      return this.wrapped("map", schema.getValueSchema());
    }
    if (schema.isStructSchema() || schema.isUnionSchema()) {
      return this.structure(schema);
    }

    return undefined;
  }

  private wrapped(
    wrapper: string,
    valueSchema: NormalizedSchema,
  ): string | undefined {
    const valueKind = this.kind(valueSchema);

    return valueKind === undefined ? undefined : `${wrapper}:${valueKind}`;
  }

  private structure(schema: NormalizedSchema): string {
    const shapeName = schema.getName() ?? "";
    if (!this.allShapes.has(shapeName)) {
      const members = new Map<string, string>();
      this.allShapes.set(shapeName, members);
      for (const [memberName, member] of schema.structIterator()) {
        const traits = member.getMergedTraits() as Record<string, unknown>;
        const inBody = outOfBodyTraits.every(
          (trait) => !Object.hasOwn(traits, trait),
        );
        const memberKind = inBody && this.kind(member);
        if (typeof memberKind === "string") {
          members.set(memberName, memberKind);
        }
      }
    }

    return `#${shapeName}`;
  }

  /**
   * The structures that hold a blob or a timestamp somewhere beneath them,
   * found by growing the set until nothing more joins it, which is what
   * settles recursive shapes.
   */
  private relevantShapes(): Set<string> {
    const relevant = new Set<string>();
    let grew = true;
    while (grew) {
      grew = false;
      for (const [shapeName, members] of this.allShapes) {
        if (
          relevant.has(shapeName) ||
          members
            .values()
            .every((kind) => !this.leadsToDecoding(kind, relevant))
        ) {
          continue;
        }

        relevant.add(shapeName);
        grew = true;
      }
    }

    return relevant;
  }

  private leadsToDecoding(kind: string, relevant: Set<string>): boolean {
    const leaf = kind.replace(/^(?:list:|map:)*/, "");

    return !leaf.startsWith("#") || relevant.has(leaf.slice(1));
  }
}
