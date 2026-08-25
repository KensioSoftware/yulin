import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import {
  unsimulatedConfigurationReasons,
  unsimulatedPropertyReasons,
} from "./sim-cfn-athena-work-group-unsimulated-properties.js";

/**
 * The top-level properties a workgroup Resource is created from.
 */
const readProperties = new Set([
  "Name",
  "Description",
  "State",
  "WorkGroupConfiguration",
]);

/**
 * The WorkGroupConfiguration settings a workgroup Resource is created from.
 */
const readConfiguration = new Set([
  "BytesScannedCutoffPerQuery",
  "EnforceWorkGroupConfiguration",
  "PublishCloudWatchMetricsEnabled",
  "RequesterPaysEnabled",
  "ResultConfiguration",
  "EngineVersion",
]);

interface SimCfnAthenaWorkGroupPropertyRulesProperties {
  readonly properties: SimCfnTemplateValueRecord;
  readonly ignorer: SimCfnPropertyIgnorer;
}

/**
 * What a workgroup Resource is created without acting on.
 *
 * Nothing here fails the Resource. A template naming a setting this simulation
 * has no answer for still deploys its workgroup, and the setting is recorded
 * so a reader can see what the deployed workgroup is not doing.
 */
export class SimCfnAthenaWorkGroupPropertyRules {
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly ignorer: SimCfnPropertyIgnorer;

  constructor(properties: SimCfnAthenaWorkGroupPropertyRulesProperties) {
    this.properties = properties.properties;
    this.ignorer = properties.ignorer;
  }

  /**
   * Record every property the workgroup is created without.
   */
  apply(): void {
    for (const name of Object.keys(this.properties)) {
      this.applyToProperty(name);
    }

    this.applyToConfiguration();
  }

  private applyToProperty(name: string): void {
    if (readProperties.has(name)) {
      return;
    }

    this.ignore(name, unsimulatedPropertyReasons.get(name));
  }

  private applyToConfiguration(): void {
    const configuration = this.properties["WorkGroupConfiguration"];

    if (!isRecord(configuration)) {
      return;
    }

    for (const name of Object.keys(configuration)) {
      if (readConfiguration.has(name)) {
        continue;
      }

      this.ignore(
        `WorkGroupConfiguration.${name}`,
        unsimulatedConfigurationReasons.get(name),
      );
    }
  }

  private ignore(path: string, unsimulatedReason: string | undefined): void {
    const name = path.slice(path.lastIndexOf(".") + 1);

    if (unsimulatedReason === undefined) {
      this.ignorer.ignoreProperty(
        path,
        `${name} is not a property simulated Athena knows about, so the ` +
          `workgroup is created without it`,
      );

      return;
    }

    this.ignorer.ignoreProperty(
      path,
      `${name} is a real AWS::Athena::WorkGroup property simulated Athena ` +
        `does not act on: ${unsimulatedReason}`,
    );
  }
}
