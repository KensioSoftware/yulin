/**
 * What a simulated Parameter Store answered a template Parameter with.
 *
 * A reason is set only where the store could not answer the name, in which
 * case the value is a stand-in. Simulated CloudFormation deploys what it can,
 * so a Parameter naming configuration a test never created still resolves to
 * something, and the reason is what the Stack records about it.
 */
export interface SimCfnParameterStoreValue {
  /** The value held under the name, or a stand-in where none is held. */
  readonly value: string;

  /** Why the value is a stand-in rather than a stored one. */
  readonly reason?: string | undefined;
}

/**
 * The simulated Parameter Store that a template Parameter's name is read from.
 *
 * Declared here so that the CloudFormation engine can resolve an
 * `AWS::SSM::Parameter::Value<...>` Parameter without importing simulated SSM,
 * the same way it reaches a dynamic reference resolver.
 */
export interface SimCfnParameterStoreReader {
  /**
   * Read the current value held under one parameter name.
   */
  read(name: string): SimCfnParameterStoreValue;
}
