import type { SimCfnResource } from "../resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../template/value/sim-cfn-template-value.js";

interface SimCfnResourceArnProperties {
  readonly resource: SimCfnResource;
  readonly arnFormat: string;
  readonly resolvedProperties: SimCfnTemplateValueRecord;
}

const variablePattern = /\$\{(?<name>[^}]+)\}/gu;

/**
 * The ARN a read handler's calls on one Resource are authorized on.
 *
 * The ARN format's variables are filled from the Stack's scope and from the
 * Resource's own properties, which is the whole of it for a Resource whose
 * template names it (`DomainName` and `RepositoryName` on a CodeArtifact
 * repository). A Resource whose name CloudFormation generated holds no such
 * property. Its ARN comes from its `Arn` attribute, or from its Ref where the
 * format has one variable left, both of which a service answers once it has
 * created the Resource.
 *
 * An ARN that cannot be built is refused. Authorizing the calls on a guessed
 * ARN would let a policy scoped to the real one pass or fail by accident.
 */
export class SimCfnResourceArn {
  private readonly resource: SimCfnResource;
  private readonly arnFormat: string;
  private readonly resolvedProperties: ReadonlyMap<string, unknown>;

  constructor(properties: SimCfnResourceArnProperties) {
    this.resource = properties.resource;
    this.arnFormat = properties.arnFormat;
    this.resolvedProperties = new Map(
      Object.entries(properties.resolvedProperties),
    );
  }

  /** The Resource's ARN, or a refusal saying which variable could not be filled. */
  value(): string {
    const unfilled = this.unfilledVariables();

    if (unfilled.length === 0) {
      return this.filled();
    }

    const arnAttribute = this.deployedValue(() => {
      return this.resource.attributeValue("Arn");
    });

    if (arnAttribute?.startsWith("arn:") === true) {
      return arnAttribute;
    }

    const refValue = this.deployedValue(() => this.resource.refValue);
    const [onlyUnfilled] = unfilled;

    if (refValue !== undefined && unfilled.length === 1) {
      return this.filled(new Map([[onlyUnfilled, refValue]]));
    }

    throw new Error(
      `Sim CloudFormation cannot authorize the read handler of Resource ${this.resource.logicalId} (${String(this.resource.type)}): its ARN format ${this.arnFormat} needs ${unfilled.join(", ")}, which neither its properties nor its attributes give`,
    );
  }

  private filled(
    extra: ReadonlyMap<string | undefined, string> = new Map(),
  ): string {
    return this.arnFormat.replaceAll(
      variablePattern,
      (_match, name: string) => {
        return extra.get(name) ?? this.variable(name) ?? "";
      },
    );
  }

  private unfilledVariables(): string[] {
    return this.arnFormat
      .matchAll(variablePattern)
      .map((match) => match.groups?.["name"] ?? "")
      .filter((name) => this.variable(name) === undefined)
      .toArray();
  }

  private variable(name: string): string | undefined {
    const { accountId, regionName } = this.resource.accountRegionScope;

    switch (name) {
      case "Partition": {
        return "aws";
      }

      case "Region": {
        return regionName;
      }

      case "Account": {
        return accountId;
      }

      default: {
        return this.property(name) ?? this.property(this.namePropertyFor(name));
      }
    }
  }

  private property(name: string): string | undefined {
    return stringValue(this.resolvedProperties.get(name));
  }

  /**
   * The property an ARN variable is held in under another name. The Service
   * Authorization Reference names a CodeBuild project's `${ProjectName}`,
   * which `AWS::CodeBuild::Project` calls `Name`.
   */
  private namePropertyFor(variable: string): string {
    const typeName = this.resource.type?.split("::").at(-1);

    if (variable === `${String(typeName)}Name`) {
      return "Name";
    }

    return variable;
  }

  /**
   * A value the Resource answers once a service has created it. A Resource
   * that was skipped answers with a stand-in naming itself, which is no part
   * of an ARN.
   */
  private deployedValue(read: () => unknown): string | undefined {
    const { createComplete, skipped, inert } = this.resource;

    if (!createComplete || skipped || inert) {
      return undefined;
    }

    // A Resource type with no Arn attribute refuses to answer for one, which
    // here only means the ARN has to come from somewhere else.
    try {
      return stringValue(read());
    } catch {
      return undefined;
    }
  }
}

/** The value where it is a string, which is all an ARN can be made of. */
function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  return undefined;
}
