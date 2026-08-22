/**
 * The CloudFormation Resource types simulated Step Functions creates.
 *
 * Named here rather than spelled out where they are used, because each one is
 * written twice, once by the factory dispatching on it and once by the
 * refusals that quote it back to whoever wrote the template.
 */
export const stateMachineResourceType = "AWS::StepFunctions::StateMachine";

export const stateMachineResourceTypeName = "StateMachine";
