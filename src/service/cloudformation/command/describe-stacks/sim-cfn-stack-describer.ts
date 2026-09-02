import type { SimCfnStack } from "../../stack/sim-cfn-stack.js";
import type { SimCloudFormationStackDescription } from "./describe-stacks.command.js";

/**
 * Converts an internal simulated CloudFormation Stack into the public
 * DescribeStacks StackDescription shape.
 *
 * The command handler owns request handling concerns such as StackName
 * filtering, background task sequencing, and response metadata. This class owns
 * only the stable field mapping from SimCfnStack state to the minimal
 * AWS-compatible description returned by the simulator.
 */
export class SimCfnStackDescriber {
  /**
   * Describe one simulated Stack for a DescribeStacks response.
   *
   * Only fields currently represented by the simulator are populated. Stack
   * identity and lifecycle fields come directly from SimCfnStack, while Outputs
   * are expanded from the Stack's output map into the array shape used by
   * CloudFormation responses.
   */
  describe(stack: SimCfnStack): SimCloudFormationStackDescription {
    return {
      StackId: stack.stackId,
      StackName: stack.stackName,
      StackStatus: stack.status,
      StackStatusReason: stack.error?.message,
      Outputs: stack.outputs
        .values()
        .map((output) => ({
          OutputKey: output.outputKey,
          OutputValue: output.value,
          Description: output.description,
          ExportName: output.exportName,
        }))
        .toArray(),
    };
  }
}
