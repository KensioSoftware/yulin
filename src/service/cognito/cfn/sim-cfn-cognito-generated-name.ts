import { SimCfnGeneratedResourceName } from "../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";

/**
 * How long a pool name or an app client name may be, which is the same
 * length for both. `SimCognitoName` is where that rule is applied.
 */
const maximumNameLength = 128;

interface SimCfnCognitoGeneratedNameProperties {
  readonly stackName: string | undefined;
  readonly logicalId: string;
}

/**
 * The name CloudFormation gives a user pool or an app client whose template
 * does not name it.
 *
 * `UserPoolName` and `ClientName` are both optional on their Resource types,
 * and a CDK `UserPool` construct emits neither, so a template without them is
 * ordinary rather than incomplete. `CreateUserPool` and
 * `CreateUserPoolClient` both require a name, which is why one is generated
 * here rather than passed on as undefined.
 *
 * One class covers both because Cognito gives a pool and a client the same
 * name rules. A name is at most 128 characters, so a long stack name and
 * logical ID together are trimmed to fit. How a generated name is put
 * together and trimmed is the same for every service, and lives in
 * `SimCfnGeneratedResourceName`. The characters a stack name and a
 * logical ID are made of are all ones a Cognito name allows, so nothing here
 * has to replace any of them.
 */
export class SimCfnCognitoGeneratedName {
  private readonly generated: SimCfnGeneratedResourceName;

  constructor(properties: SimCfnCognitoGeneratedNameProperties) {
    this.generated = new SimCfnGeneratedResourceName({
      stackName: properties.stackName,
      logicalId: properties.logicalId,
      maximumLength: maximumNameLength,
    });
  }

  /**
   * The generated name.
   */
  get value(): string {
    return this.generated.value;
  }
}
