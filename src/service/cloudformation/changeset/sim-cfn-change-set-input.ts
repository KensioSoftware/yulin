import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCloudFormationStackName } from "../stack/sim-cfn-stack.type.js";
import type { SimCreateChangeSetCommandInput } from "../command/create-change-set/create-change-set.command.js";
import { simCfnChangeSetType } from "./sim-cfn-change-set-type.js";
import type {
  SimCfnChangeSetName,
  SimCfnChangeSetType,
} from "./sim-cfn-change-set.type.js";

/**
 * What a CreateChangeSet input says, once it has been read.
 */
export interface SimCfnChangeSetRequest {
  readonly stackName: SimCloudFormationStackName;
  readonly changeSetName: SimCfnChangeSetName;
  readonly type: SimCfnChangeSetType;
  readonly templateBody: string;
}

/**
 * Read a CreateChangeSet input, refusing one that leaves out what a change set
 * cannot be built without.
 */
export function simCfnChangeSetRequest(
  input: SimCreateChangeSetCommandInput,
): SimCfnChangeSetRequest {
  const { StackName, ChangeSetName, TemplateBody } = input;

  assertDefined(StackName, "CreateChangeSetCommand.input.StackName");
  assertDefined(ChangeSetName, "CreateChangeSetCommand.input.ChangeSetName");
  assertDefined(TemplateBody, "CreateChangeSetCommand.input.TemplateBody");

  return {
    stackName: StackName as SimCloudFormationStackName,
    changeSetName: ChangeSetName as SimCfnChangeSetName,
    type: simCfnChangeSetType(input.ChangeSetType),
    templateBody: TemplateBody,
  };
}
