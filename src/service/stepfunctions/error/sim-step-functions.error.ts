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
 * A `Choice` state none of whose rules matched, where it carries no `Default`.
 */
export class SimStatesNoChoiceMatched extends SimStepFunctionsError {
  public override readonly name = "SimStatesNoChoiceMatched";

  constructor(message: string) {
    super(message, "States.NoChoiceMatched");
  }
}

/**
 * A `Task` state that could not do its work.
 *
 * The task itself failed rather than the handler it reached: the function was
 * not there, the execution role could not be assumed, or the role is not
 * allowed to invoke it. Real Step Functions names each of these after the
 * failure a task had, and this is the name a `Retry` or a `Catch` matches.
 */
export class SimStatesTaskFailure extends SimStepFunctionsError {
  public override readonly name = "SimStatesTaskFailure";

  constructor(message: string) {
    super(message, "States.TaskFailed");
  }
}

/**
 * A handler that raised, reported under its own error type.
 *
 * A `Task` state whose `Resource` is a function ARN is talking to the function
 * rather than to the Lambda API, and the error name it fails with is the one
 * the handler raised. `NotEligible` thrown in a handler is `NotEligible` here.
 *
 * The error type the handler raised under is the states error name, so it is
 * given where this is raised rather than fixed by the class.
 */
export class SimStatesTaskHandlerFailure extends SimStepFunctionsError {
  public override readonly name = "SimStatesTaskHandlerFailure";
}

/**
 * A service that refused the call a `Task` state made.
 *
 * Amazon States Language names a service error after the service and the error
 * together, so `DynamoDb.ConditionalCheckFailedException` is a conditional
 * write that did not hold. The name is given where this is raised, because it
 * is read off what the service said rather than fixed by the class.
 */
export class SimStatesServiceFailure extends SimStepFunctionsError {
  public override readonly name = "SimStatesServiceFailure";
}

/**
 * A state that could not run on the data it was given.
 *
 * A `Choice` rule comparing a field that is not there, or a `Wait` reading a
 * duration from a path holding something else. Real Step Functions fails the
 * execution with `States.Runtime` for both.
 */
export class SimStatesRuntimeFailure extends SimStepFunctionsError {
  public override readonly name = "SimStatesRuntimeFailure";

  constructor(message: string) {
    super(message, "States.Runtime");
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
 * A state machine an ARN names nothing for.
 */
export class SimStatesResourceNotFound extends SimStepFunctionsError {
  public override readonly name = "StateMachineDoesNotExist";

  constructor(message: string) {
    super(message, "States.Runtime");
  }
}

/**
 * An execution an ARN names nothing for.
 *
 * Real Step Functions tells this apart from a missing state machine, and a
 * caller branching on the error name needs the same two names.
 */
export class SimStatesExecutionNotFound extends SimStepFunctionsError {
  public override readonly name = "ExecutionDoesNotExist";

  constructor(message: string) {
    super(message, "States.Runtime");
  }
}

/**
 * A name outside what Step Functions allows.
 */
export class SimStatesInvalidName extends SimStepFunctionsError {
  public override readonly name = "InvalidName";

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

/**
 * A resource a tag request's ARN names nothing for.
 *
 * The tag commands reach a state machine, an activity or an execution, so real
 * Step Functions answers them with `ResourceNotFound` rather than the
 * `StateMachineDoesNotExist` that `DescribeStateMachine` gives.
 */
export class SimStatesTaggedResourceNotFound extends SimStepFunctionsError {
  public override readonly name = "ResourceNotFound";

  constructor(message: string) {
    super(message, "States.Runtime");
  }
}

/**
 * A tag key or value outside what Step Functions takes.
 */
export class SimStatesInvalidTag extends SimStepFunctionsError {
  public override readonly name = "ValidationException";

  constructor(message: string) {
    super(message, "States.Runtime");
  }
}

/**
 * A request that would leave a resource holding more tags than it may.
 */
export class SimStatesTooManyTags extends SimStepFunctionsError {
  public override readonly name = "TooManyTags";

  constructor(message: string) {
    super(message, "States.Runtime");
  }
}
