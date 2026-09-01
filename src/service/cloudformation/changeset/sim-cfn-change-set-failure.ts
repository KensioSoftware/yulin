import type { SimCfnStack } from "../stack/sim-cfn-stack.js";
import { simCfnStackTemplateChanged } from "../stack/update/sim-cfn-stack-template-changes.js";
import type { SimCfnTemplate } from "../template/sim-cfn-template.js";
import { simCfnChangeSetNoChangesMessage } from "./sim-cfn-change-set-type.js";
import type { SimCfnChangeSetType } from "./sim-cfn-change-set.type.js";

interface SimCfnChangeSetFailureProperties {
  readonly stack: SimCfnStack;
  readonly type: SimCfnChangeSetType;
  readonly template: SimCfnTemplate;
  readonly changeCount: number;
}

/**
 * Why a change set failed, for one that would change nothing.
 *
 * Everything else in the template counts as well as the Resources, the same way
 * it does for an update, because a change set that only moves an Output still
 * has something to execute.
 *
 * A `CREATE` change set never fails this way. The Stack it was made for holds
 * no Resource, so there is always something for it to do.
 */
export function simCfnChangeSetFailure(
  properties: SimCfnChangeSetFailureProperties,
): string | undefined {
  const { stack, type, template, changeCount } = properties;

  const noChanges =
    type === "UPDATE" &&
    changeCount === 0 &&
    !simCfnStackTemplateChanged(stack.currentTemplate, template);

  return noChanges ? simCfnChangeSetNoChangesMessage : undefined;
}
