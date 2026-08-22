import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimPersonalizeResourceStore } from "../resource/sim-personalize-resource-store.js";
import type { SimPersonalizeResource } from "../resource/sim-personalize-resource.js";

/**
 * The resource a create command has just made, read back from the ARN it
 * answered with.
 *
 * The command is what creates the resource, and this is what turns its answer
 * into the object CloudFormation holds for the Resource. A `Ref` reads the name
 * off it and an `Fn::GetAtt` the ARN, and a teardown hands it back to the
 * delete command.
 */
export function simCfnPersonalizeCreated<T extends SimPersonalizeResource>(
  store: SimPersonalizeResourceStore<T>,
  arn: string | undefined,
  described: string,
): T {
  assertDefined(
    arn,
    `sim Personalize ${described} ARN after CloudFormation creation`,
  );

  const created = store.find(arn);

  assertDefined(
    created,
    `sim Personalize ${described} ${arn} after CloudFormation creation`,
  );

  return created;
}
