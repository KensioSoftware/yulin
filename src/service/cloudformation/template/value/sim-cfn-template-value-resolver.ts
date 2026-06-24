import type { SimCfnParameters } from "../../parameters/sim-cfn-parameters.js";
import { parseSimCfnNode } from "../parse/node/sim-cfn-node-parser.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "./sim-cfn-template-value.js";
import type { SimCfnResourceRefResolver } from "../resolve/sim-cfn-resource-ref-resolver.js";
import type { SimCfnPseudoParameters } from "../../parameters/pseudo/sim-cfn-pseudo-parameters.js";
import { SimCfnResolveContext } from "../resolve/sim-cfn-resolve-context.js";
import type { SimCfnMappings } from "../mapping/sim-cfn-mappings.js";

interface SimCfnTemplateValueResolverProps {
  readonly parameters: SimCfnParameters;
  readonly resources?: SimCfnResourceRefResolver | undefined;
  readonly pseudoParameters?: SimCfnPseudoParameters | undefined;
  readonly mappings?: SimCfnMappings | undefined;
}

/**
 * Resolve supported CloudFormation value expressions inside template values.
 */
export class SimCfnTemplateValueResolver {
  private readonly context: SimCfnResolveContext;

  constructor(props: SimCfnTemplateValueResolverProps) {
    this.context = new SimCfnResolveContext(
      props.parameters,
      props.resources,
      props.pseudoParameters,
      props.mappings,
    );
  }

  /**
   * Resolve Parameters and supported intrinsic functions recursively.
   */
  resolve(value: SimCfnTemplateValue): SimCfnTemplateValue {
    return parseSimCfnNode(value).resolve(this.context);
  }

  /**
   * Resolve every value in a CloudFormation template object.
   */
  resolveRecord(value: SimCfnTemplateValueRecord): SimCfnTemplateValueRecord {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        this.resolve(entryValue),
      ]),
    );
  }
}
