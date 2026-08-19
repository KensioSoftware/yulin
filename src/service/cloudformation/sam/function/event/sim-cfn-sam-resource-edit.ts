import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import { isSamTemplateRecord } from "../../sim-cfn-sam-record.js";

/**
 * A change an event makes to a Resource the template already declares.
 *
 * Most events expand into Resources of their own, which are keyed by a logical
 * ID nothing else uses and merged into the template alongside everything else.
 * An `S3` event has nowhere to put one. In CloudFormation a Bucket carries its
 * own notifications, and the event adds to a Resource it did not make. Keying
 * the expansion by the Bucket's logical ID would replace the Bucket, since the
 * expanded Resources are merged last write wins. An edit instead says which
 * Resource it changes, and is handed that Resource to rebuild.
 */
export interface SamResourceEdit {
  /** The logical ID of the Resource in the template this edit changes. */
  readonly logicalId: string;
  /** The Resource as the edit leaves it, from the Resource as it stands. */
  readonly edit: (
    resource: SimCfnTemplateValueRecord,
  ) => SimCfnTemplateValueRecord;
}

/**
 * The expanded Resources with every edit applied, in the order the edits were
 * collected.
 *
 * Each edit is handed what the one before it left, so two events notifying the
 * same Bucket both reach it. An edit naming a Resource the template does not
 * declare changes nothing, the way an event of a type nothing expands leaves
 * the function as it is.
 */
export function samEditedResources(
  resources: Record<string, SimCfnTemplateValue>,
  edits: readonly SamResourceEdit[],
): Record<string, SimCfnTemplateValue> {
  return edits.reduce(
    (edited, edit) => ({
      ...edited,
      ...editedResource(edited[edit.logicalId], edit),
    }),
    resources,
  );
}

function editedResource(
  resource: SimCfnTemplateValue | undefined,
  edit: SamResourceEdit,
): Record<string, SimCfnTemplateValue> {
  if (!isSamTemplateRecord(resource)) {
    return {};
  }

  return { [edit.logicalId]: edit.edit(resource) };
}
