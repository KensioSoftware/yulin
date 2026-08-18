import type { SimCfnParameters } from "../../parameters/sim-cfn-parameters.js";
import { parseSimCfnNode } from "../parse/node/sim-cfn-node-parser.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "./sim-cfn-template-value.js";
import type { SimCfnResourceRefResolver as SimCfnResourceReferenceResolver } from "../resolve/sim-cfn-resource-ref-resolver.js";
import type { SimCfnPseudoParameters } from "../../parameters/pseudo/sim-cfn-pseudo-parameters.js";
import { SimCfnResolveContext } from "../resolve/sim-cfn-resolve-context.js";
import type { SimCfnMappings } from "../mapping/sim-cfn-mappings.js";
import type { SimCfnConditions } from "../condition/sim-cfn-conditions.js";
import type { SimCfnExports } from "../../export/sim-cfn-exports.js";
import {
  resolveSimCfnValueAt,
  resolveSimCfnValueIn,
} from "./sim-cfn-value-path.js";

interface SimCfnTemplateValueResolverProperties {
  readonly parameters: SimCfnParameters;
  readonly resources?: SimCfnResourceReferenceResolver | undefined;
  readonly pseudoParameters?: SimCfnPseudoParameters | undefined;
  readonly mappings?: SimCfnMappings | undefined;
  readonly conditions?: SimCfnConditions | undefined;
  readonly exports?: SimCfnExports | undefined;
}

/**
 * Resolve supported CloudFormation value expressions inside template values.
 */
export class SimCfnTemplateValueResolver {
  private readonly context: SimCfnResolveContext;

  constructor(properties: SimCfnTemplateValueResolverProperties) {
    this.context = new SimCfnResolveContext({
      parameters: properties.parameters,
      resources: properties.resources,
      pseudoParameters: properties.pseudoParameters,
      mappings: properties.mappings,
      conditions: properties.conditions,
      exports: properties.exports,
    });
  }

  /**
   * Resolve Parameters and supported intrinsic functions recursively.
   */
  resolve(value: SimCfnTemplateValue): SimCfnTemplateValue {
    return parseSimCfnNode(value).resolve(this.context);
  }

  /**
   * Resolve every value in a CloudFormation template object.
   *
   * A value that cannot be resolved carries the name it was stored under, so
   * the caller can say which property of which Resource was at fault.
   */
  resolveRecord(value: SimCfnTemplateValueRecord): SimCfnTemplateValueRecord {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        this.resolveEntry(key, entryValue),
      ]),
    );
  }

  /**
   * Resolve every value in a template object belonging to a named subject.
   *
   * The subject is the Resource or Output the object came from, which this
   * resolver has no way to know. A value that fails to resolve is named with
   * both, so a template author is told where to look.
   */
  resolveRecordFor(
    subject: string,
    value: SimCfnTemplateValueRecord,
  ): SimCfnTemplateValueRecord {
    return resolveSimCfnValueIn(subject, () => this.resolveRecord(value));
  }

  /**
   * Resolve one entry, naming it if the value underneath fails.
   *
   * Parsing happens outside the catch, because a value that does not parse
   * fails with a message that already quotes the expression at fault.
   */
  private resolveEntry(
    key: string,
    value: SimCfnTemplateValue,
  ): SimCfnTemplateValue {
    const node = parseSimCfnNode(value);

    return resolveSimCfnValueAt(key, () => node.resolve(this.context));
  }
}
