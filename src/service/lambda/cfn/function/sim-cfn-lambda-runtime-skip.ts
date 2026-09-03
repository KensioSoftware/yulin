import { SimCfnNamedSkip } from "../../../cloudformation/resource/unsupported/sim-cfn-named-skip.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnLambdaFunctionProperties } from "./sim-cfn-lambda-function-properties-parser.js";

/**
 * Sim Lambda runs handler modules in a Node.js vm, so it simulates the
 * Node.js managed runtimes.
 */
const nodeJsRuntimePrefix = "nodejs";

/**
 * Skips template functions declaring a runtime sim Lambda does not simulate.
 *
 * Yulin is a Node.js simulator: function code is evaluated as CommonJS modules
 * in a vm, so a Python, Java or Go function cannot run whatever its code says.
 * CDK synthesizes such functions into a user's stack without being asked to.
 * The CDK BucketDeployment provider, for instance, is a Python function, and
 * sim CloudFormation simulates that custom resource directly rather than
 * running its provider.
 *
 * A container image function is not declined here. It declares no Runtime at
 * all, so there is nothing for this gate to match on, and
 * SimCfnLambdaImageSkip declines it instead.
 *
 * Declining those functions on their Runtime keeps the reason honest, and
 * keeps their code from being loaded at all. A function with an executable
 * binding is exempt, because the binding replaces the code with a real
 * in-process handler, which is exactly how to simulate a function whose real
 * runtime Yulin cannot run.
 *
 * The "Unsupported sim ... CloudFormation" wording marks the Resource as
 * skipped rather than failing the stack. What the Stack does with the refusal
 * is then its own decision: a provider function for a custom Resource sim
 * CloudFormation carries out itself is recorded as inert instead, because this
 * message would otherwise tell a reader to bind a handler to a function that
 * has nothing left to do.
 *
 * The refusal carries the function's name, which the properties parser has
 * already worked out by the time this gate is asked. CDK writes a function's
 * log group name as `/aws/lambda/` joined to a Ref of the function. A refusal
 * carrying no name puts the log group under `/aws/lambda/` and a logical ID,
 * a name no account would hold.
 */
export class SimCfnLambdaRuntimeSkip {
  /**
   * A skip error when this function's runtime is not simulated, otherwise
   * undefined.
   */
  findSkipError(
    resource: SimCfnResource,
    functionProperties: SimCfnLambdaFunctionProperties,
    bound: boolean,
  ): Error | undefined {
    const { runtimeName } = functionProperties;

    if (
      bound ||
      runtimeName === undefined ||
      runtimeName.startsWith(nodeJsRuntimePrefix)
    ) {
      return undefined;
    }

    return new SimCfnNamedSkip(
      `Unsupported sim Lambda CloudFormation Resource ${resource.logicalId}: ` +
        `sim Lambda simulates Node.js runtimes, and this function declares ` +
        `Runtime ${runtimeName}. Bind a real in-process handler to this ` +
        `function to simulate it.`,
      functionProperties.functionName,
    );
  }
}
