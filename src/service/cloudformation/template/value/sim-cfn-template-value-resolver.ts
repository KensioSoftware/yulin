import type { SimCfnParameters } from "../../parameters/sim-cfn-parameters.js";
import { SimCfnResolveContext } from "../node/sim-cfn-node.js";
import { parseSimCfnNode } from "../parse/sim-cfn-node-parser.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "./sim-cfn-template-value.js";

interface SimCfnTemplateValueResolverProps {
  readonly parameters: SimCfnParameters;
}

/**
 * Resolve supported CloudFormation value expressions inside template values.
 */
export class SimCfnTemplateValueResolver {
  private readonly context: SimCfnResolveContext;

  constructor(props: SimCfnTemplateValueResolverProps) {
    this.context = new SimCfnResolveContext(props.parameters);
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
