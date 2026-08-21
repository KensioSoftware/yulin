/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import {
  block,
  field,
  properties,
  renamed,
  tags,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
import type { TerraformMappedResource } from "../sim-tf-mapping.type.js";

/**
 * A repository.
 *
 * The name is the only property simulated ECR acts on. The rest describe image
 * content, and nothing here pulls or inspects an image, so they are carried
 * across and recorded against the Resource rather than left off. A repository
 * scanning on push says on its Resource that no image is ever scanned.
 */
export function ecrRepository(
  context: TerraformMappingContext,
): TerraformMappedResource {
  const scanning = block(context, "image_scanning_configuration");

  return {
    Type: "AWS::ECR::Repository",
    Properties: {
      ...renamed(context, {
        RepositoryName: "name",
        ImageTagMutability: "image_tag_mutability",
      }),
      ...properties({
        ImageScanningConfiguration:
          scanning === undefined
            ? undefined
            : { ScanOnPush: field(scanning, "scan_on_push") === true },
        Tags: tags(context),
      }),
    },
  };
}
