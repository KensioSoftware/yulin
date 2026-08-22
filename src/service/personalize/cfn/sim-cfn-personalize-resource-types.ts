/**
 * The CloudFormation Resource types simulated Personalize creates.
 *
 * Named here rather than spelled out where they are used, because each one is
 * written twice. Once by the factory dispatching on it, and once by the creator
 * that quotes it back to whoever wrote the template.
 */
export const personalizeDatasetGroupResourceType =
  "AWS::Personalize::DatasetGroup";

export const personalizeSchemaResourceType = "AWS::Personalize::Schema";

export const personalizeDatasetResourceType = "AWS::Personalize::Dataset";

export const personalizeSolutionResourceType = "AWS::Personalize::Solution";

export const personalizeEventTrackerResourceType =
  "AWS::Personalize::EventTracker";

/** The type name the CloudFormation layer dispatches on, without its prefix. */
export const personalizeDatasetGroupResourceTypeName = "DatasetGroup";

export const personalizeSchemaResourceTypeName = "Schema";

export const personalizeDatasetResourceTypeName = "Dataset";

export const personalizeSolutionResourceTypeName = "Solution";

export const personalizeEventTrackerResourceTypeName = "EventTracker";
