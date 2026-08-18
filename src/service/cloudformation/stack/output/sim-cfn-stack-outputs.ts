import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import type { SimCfnTemplate } from "../../template/sim-cfn-template.js";
import type { SimCfnExports } from "../../export/sim-cfn-exports.js";
import { simCfnStackExports } from "../../export/sim-cfn-stack-exports.js";
import type { SimCfnStackOutput } from "./sim-cfn-stack-output.js";
import { SimCfnStackOutputResolver } from "./sim-cfn-stack-output-resolver.js";

interface SimCfnStackOutputsProperties {
  readonly stackName: string;
  readonly exports?: SimCfnExports | undefined;
}

/**
 * One Stack's Outputs, and the export names they publish.
 *
 * Resolving and publishing are the same step because an export carries a
 * resolved Output value, which only exists once the Resources it reads have
 * been created. Both a deployment and an update end by running this.
 */
export class SimCfnStackOutputs {
  private readonly stackName: string;
  private readonly exports: SimCfnExports | undefined;

  constructor(properties: SimCfnStackOutputsProperties) {
    this.stackName = properties.stackName;
    this.exports = properties.exports;
  }

  /**
   * Resolve the Stack's Outputs and publish the ones it exports.
   *
   * An export name another Stack already holds is refused, and the refusal
   * fails the deployment or the update that ran this.
   */
  resolve(
    template: SimCfnTemplate,
    resources: ReadonlyMap<string, SimCfnResource>,
  ): Map<string, SimCfnStackOutput> {
    const outputs = new SimCfnStackOutputResolver({
      template,
      resources,
      exports: this.exports,
    }).resolve();

    this.exports?.publish(this.stackName, simCfnStackExports(outputs));

    return outputs;
  }

  /** Let go of the export names this Stack published, once it has gone. */
  release(): void {
    this.exports?.release(this.stackName);
  }
}
