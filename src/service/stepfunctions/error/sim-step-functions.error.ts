/**
 * Base class for simulated Step Functions errors.
 *
 * Every failure inside a state machine carries the name Amazon States Language
 * gives it. That name is what a `Retry` or a `Catch` matches on, so it is held
 * here rather than derived at the point one is evaluated.
 */
export class SimStepFunctionsError extends Error {
  constructor(
    message: string,
    public readonly statesErrorName: string,
  ) {
    super(message);
  }
}

/**
 * A Reference Path this simulator cannot read.
 *
 * Real Step Functions rejects a malformed path when the state machine is
 * created. It is raised here as well for a path outside the subset this reads,
 * which is a narrower thing and worth telling apart in the message.
 */
export class SimStatesPathError extends SimStepFunctionsError {
  public override readonly name = "SimStatesPathError";

  constructor(message: string) {
    super(message, "States.QueryEvaluationError");
  }
}

/**
 * A path selecting nothing where the state needed a value.
 *
 * `InputPath`, `OutputPath` and a Payload Template field all fail this way when
 * the document holds nothing at the path.
 */
export class SimStatesPathMatchFailure extends SimStepFunctionsError {
  public override readonly name = "SimStatesPathMatchFailure";

  constructor(message: string) {
    super(message, "States.ParameterPathFailure");
  }
}

/**
 * A `ResultPath` that cannot be written into the state input.
 */
export class SimStatesResultPathMatchFailure extends SimStepFunctionsError {
  public override readonly name = "SimStatesResultPathMatchFailure";

  constructor(message: string) {
    super(message, "States.ResultPathMatchFailure");
  }
}

/**
 * An intrinsic function that cannot be parsed, or that was called wrongly.
 */
export class SimStatesIntrinsicFailure extends SimStepFunctionsError {
  public override readonly name = "SimStatesIntrinsicFailure";

  constructor(message: string) {
    super(message, "States.IntrinsicFailure");
  }
}

/**
 * A state machine definition that Amazon States Language itself refuses.
 *
 * A malformed definition, a state type that does not exist, a transition to a
 * state that is not there. Real Step Functions rejects each of these when the
 * state machine is created, and so does this.
 */
export class SimStatesInvalidDefinition extends SimStepFunctionsError {
  public override readonly name = "InvalidDefinition";

  constructor(message: string) {
    super(message, "States.QueryEvaluationError");
  }
}

/**
 * An Amazon States Language construct this simulator does not run.
 *
 * Raised when a state machine is read rather than when a state runs. A
 * definition using something unsimulated is refused whole, since a state
 * machine missing one state runs wrong, and running wrong is worse than
 * refusing.
 */
export class SimStatesUnsimulatedInput extends SimStepFunctionsError {
  public override readonly name = "SimStatesUnsimulatedInput";

  constructor(message: string) {
    super(message, "States.QueryEvaluationError");
  }
}

/**
 * A state machine or an execution an ARN names nothing for.
 */
export class SimStatesResourceNotFound extends SimStepFunctionsError {
  public override readonly name = "StateMachineDoesNotExist";

  constructor(message: string) {
    super(message, "States.Runtime");
  }
}

/**
 * A state machine of that name is already there.
 */
export class SimStateMachineAlreadyExists extends SimStepFunctionsError {
  public override readonly name = "StateMachineAlreadyExists";

  constructor(message: string) {
    super(message, "States.Runtime");
  }
}

/**
 * An execution of that name has already been started.
 */
export class SimStatesExecutionAlreadyExists extends SimStepFunctionsError {
  public override readonly name = "ExecutionAlreadyExists";

  constructor(message: string) {
    super(message, "States.Runtime");
  }
}

/**
 * A request whose own input is wrong, before anything is looked up.
 */
export class SimStatesInvalidRequest extends SimStepFunctionsError {
  public override readonly name = "InvalidArn";

  constructor(message: string) {
    super(message, "States.Runtime");
  }
}
