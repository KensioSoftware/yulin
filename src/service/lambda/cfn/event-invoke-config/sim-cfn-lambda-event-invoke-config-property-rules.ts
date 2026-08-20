import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * The whole of AWS::Lambda::EventInvokeConfig, every one of which is read.
 */
const readPropertyNames: ReadonlySet<string> = new Set([
  "DestinationConfig",
  "FunctionName",
  "MaximumEventAgeInSeconds",
  "MaximumRetryAttempts",
  "Qualifier",
]);

/**
 * Record a property of an AWS::Lambda::EventInvokeConfig Resource that nothing
 * reads, rather than failing the Resource over it.
 *
 * Every real property of this Resource type is read, so an unread one is a
 * typo or something AWS has added since. Either way a config carrying the
 * settings it does state is worth more than a stack that will not deploy.
 */
export function recordUnreadEventInvokeConfigProperties(
  resource: SimCfnResource,
  properties: SimCfnTemplateValueRecord,
): void {
  const unread = Object.keys(properties).filter(
    (name) => !readPropertyNames.has(name),
  );

  for (const name of unread) {
    resource.ignoreProperty(
      name,
      `${name} is not an AWS::Lambda::EventInvokeConfig property, so the ` +
        `event invoke config is deployed without it`,
    );
  }
}
