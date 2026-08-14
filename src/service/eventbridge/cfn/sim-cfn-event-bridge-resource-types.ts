/**
 * The CloudFormation Resource types simulated EventBridge creates.
 *
 * Named here rather than spelled out where they are used, because each one is
 * written twice: once by the factory dispatching on it, and once by the
 * refusals that quote it back to whoever wrote the template.
 */
export const eventBusResourceType = "AWS::Events::EventBus";

export const eventRuleResourceType = "AWS::Events::Rule";
