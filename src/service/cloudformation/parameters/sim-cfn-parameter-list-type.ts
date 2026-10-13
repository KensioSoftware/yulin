/**
 * Whether a declared Parameter `Type` holds a list.
 *
 * `CommaDelimitedList` and every `List<...>` type do, whatever the member
 * type. A `Ref` to one resolves to a list of strings, `List<Number>` included.
 */
export function isSimCfnParameterListType(type: string | undefined): boolean {
  return type === "CommaDelimitedList" || (type?.startsWith("List<") ?? false);
}
