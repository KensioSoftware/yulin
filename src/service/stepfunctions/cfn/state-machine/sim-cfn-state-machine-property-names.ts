/**
 * The AWS::StepFunctions::StateMachine properties this simulation acts on.
 */
export const stateMachineNamePropertyName = "StateMachineName";

export const roleArnPropertyName = "RoleArn";

export const stateMachineTypePropertyName = "StateMachineType";

export const definitionStringPropertyName = "DefinitionString";

export const definitionPropertyName = "Definition";

export const definitionSubstitutionsPropertyName = "DefinitionSubstitutions";

export const definitionS3LocationPropertyName = "DefinitionS3Location";

export const tagsPropertyName = "Tags";

/**
 * Real AWS::StepFunctions::StateMachine properties this simulation does not
 * model, and why.
 *
 * Each is recorded against the Resource rather than refused, so a template
 * carrying one still deploys a state machine that runs, and the omission is
 * somewhere a test can find it.
 */
export const unsimulatedPropertyReasons: ReadonlyMap<string, string> = new Map([
  [
    "LoggingConfiguration",
    "an execution writes no log events, so there is nothing for a log level " +
      "or a destination to decide",
  ],
  ["TracingConfiguration", "X-Ray is not simulated"],
  [
    "EncryptionConfiguration",
    "a definition is held as it was written, and no key is ever asked for",
  ],
]);
