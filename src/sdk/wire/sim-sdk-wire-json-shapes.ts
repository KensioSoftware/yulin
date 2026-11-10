import snapshot from "./sim-sdk-wire-json-shapes.json" with { type: "json" };

/**
 * The members of one structure that need decoding, by member name, each
 * mapped to its kind in the notation the snapshot is written in.
 */
export type SimSdkWireJsonShape = ReadonlyMap<string, string>;

/**
 * One service's operations whose input holds a blob or a timestamp, mapped to
 * their input structure, and the structures those inputs reach.
 */
export interface SimSdkWireJsonService {
  readonly operations: ReadonlyMap<string, string>;
  readonly shapes: ReadonlyMap<string, SimSdkWireJsonShape>;
}

/**
 * The snapshot as it is written, keyed by SDK `config.serviceId`.
 */
type SimSdkWireJsonSnapshot = Readonly<
  Record<
    string,
    {
      readonly operations: Readonly<Record<string, string>>;
      readonly shapes: Readonly<
        Record<string, Readonly<Record<string, string>>>
      >;
    }
  >
>;

/**
 * The blob and timestamp members of each bridged service's operation inputs,
 * keyed by SDK `config.serviceId`.
 *
 * They come from `sim-sdk-wire-json-shapes.json`, a snapshot of the SDK client
 * schemas written by `pnpm run sdk:wire-shapes`. Implementation code does not
 * import the SDK. A test fails when the snapshot falls behind the installed
 * SDK.
 */
export const simSdkWireJsonServices: ReadonlyMap<
  string,
  SimSdkWireJsonService
> = new Map(
  Object.entries(snapshot as SimSdkWireJsonSnapshot).map(
    ([serviceId, service]) => [
      serviceId,
      {
        operations: new Map(Object.entries(service.operations)),
        shapes: new Map(
          Object.entries(service.shapes).map(([shapeName, members]) => [
            shapeName,
            new Map(Object.entries(members)),
          ]),
        ),
      },
    ],
  ),
);
