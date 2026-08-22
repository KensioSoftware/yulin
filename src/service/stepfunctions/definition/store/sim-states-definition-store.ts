/**
 * Where a definition is stored, as an object in a bucket.
 */
export interface SimStatesDefinitionLocation {
  readonly bucketName: string;
  readonly objectKey: string;
}

/**
 * Storage a state machine definition is fetched from.
 *
 * A CloudFormation Resource writing `DefinitionS3Location` points at an object
 * rather than carrying the Amazon States Language itself. CDK writes that form
 * for `DefinitionBody.fromFile`, and for any definition past the template size
 * limit.
 */
export interface SimStatesDefinitionStore {
  /**
   * The definition held at a location, or nothing where the object is not
   * there.
   */
  read(location: SimStatesDefinitionLocation): Promise<string | undefined>;
}

/**
 * The store a simulated Step Functions built on its own has, which holds
 * nothing.
 *
 * Object storage is another simulated service, reachable through SimAws. A
 * `SimStepFunctions` constructed directly has no bucket to read, and answers
 * for every location the way it answers for an object that is absent.
 */
export class SimStatesNoDefinitionStore implements SimStatesDefinitionStore {
  read(_location: SimStatesDefinitionLocation): Promise<string | undefined> {
    return Promise.resolve(undefined);
  }
}
