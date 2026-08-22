import { assertDefined } from "../../../../../util/type-guard/defined.js";
import type { SimStateMachine } from "../../../../stepfunctions/machine/sim-state-machine.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

/**
 * CloudFormation-facing values for a simulated state machine.
 */
export class SimStateMachineCfn implements SimCfnResourceValueAdapter {
  readonly #stateMachine: SimStateMachine;

  constructor(stateMachine: SimStateMachine) {
    this.#stateMachine = stateMachine;
  }

  /**
   * A Ref to an AWS::StepFunctions::StateMachine returns the ARN.
   *
   * The other way round from most Resources, and the way round real
   * CloudFormation publishes this one. It is also what CDK reads for
   * `stateMachineArn`, so a grant or an environment variable pointing at a
   * workflow resolves.
   */
  refValue(): SimCfnTemplateValue {
    return this.#stateMachine.arn;
  }

  /**
   * The two attributes the Resource publishes, which are the ARN and the name.
   *
   * `StateMachineRevisionId` is left out. A revision is what a published
   * version is cut from, and neither is simulated.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    const values = new Map([
      ["Arn", this.#stateMachine.arn],
      ["Name", this.#stateMachine.name],
    ]);
    const value = values.get(attributeName);

    assertDefined(
      value,
      `Unsupported AWS::StepFunctions::StateMachine attribute ${attributeName}`,
    );

    return value;
  }
}
