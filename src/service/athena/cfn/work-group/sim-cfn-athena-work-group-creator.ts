import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimAthena } from "../../sim-athena.js";
import { workGroupStateFrom } from "../../command/work-group/sim-athena-work-group-input.js";
import type {
  SimAthenaWorkGroup,
  SimAthenaWorkGroupState,
} from "../../workgroup/sim-athena-work-group.js";
import { simCfnAthenaResourceCreation } from "../sim-cfn-athena-resource-error.js";
import { athenaWorkGroupResourceType } from "../sim-cfn-athena-resource-types.js";
import { SimCfnAthenaWorkGroupProperties } from "./sim-cfn-athena-work-group-properties.js";

interface SimCfnAthenaWorkGroupCreatorProperties {
  readonly athena: SimAthena;
}

/**
 * Creates and deletes a simulated workgroup for one AWS::Athena::WorkGroup
 * Resource.
 *
 * The workgroup goes through the ordinary CreateWorkGroup command rather than
 * being constructed directly, so a workgroup a template deployed is the same
 * thing an SDK caller would have got, down to the refusals.
 */
export class SimCfnAthenaWorkGroupCreator {
  private readonly athena: SimAthena;

  constructor(properties: SimCfnAthenaWorkGroupCreatorProperties) {
    this.athena = properties.athena;
  }

  /**
   * Create the workgroup a Resource declares.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimAthenaWorkGroup> {
    const read = this.read(resource, properties);

    read.recordIgnoredProperties();

    const input = read.createInput();

    return await simCfnAthenaResourceCreation(
      athenaWorkGroupResourceType,
      resource.logicalId,
      async () => {
        /*
         * The state is read before the workgroup is made rather than after.
         * CloudFormation fails a Resource without taking back what its
         * creation already did, so a state this simulation will not take has
         * to be refused while there is still nothing to leave behind.
         */
        const state = workGroupStateFrom(read.state());

        await this.athena.createWorkGroup({ input });
        await this.applyState(String(input.Name), state);

        const workGroup = this.athena.findWorkGroup(String(input.Name));

        assertDefined(
          workGroup,
          `sim Athena workgroup ${String(input.Name)} after CloudFormation ` +
            `creation`,
        );

        return workGroup;
      },
    );
  }

  /**
   * Delete the workgroup a Resource created.
   *
   * Deleted recursively, so a workgroup the stack also gave named queries goes
   * with them rather than failing the stack deletion.
   */
  async delete(workGroup: SimAthenaWorkGroup): Promise<void> {
    await this.athena.deleteWorkGroup({
      input: { WorkGroup: workGroup.name, RecursiveDeleteOption: true },
    });
  }

  private async applyState(
    name: string,
    state: SimAthenaWorkGroupState | undefined,
  ): Promise<void> {
    if (state === undefined) {
      return;
    }

    await this.athena.updateWorkGroup({
      input: { WorkGroup: name, State: state },
    });
  }

  private read(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimCfnAthenaWorkGroupProperties {
    return new SimCfnAthenaWorkGroupProperties({ resource, properties });
  }
}
