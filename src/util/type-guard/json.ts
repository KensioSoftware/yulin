export type JSONValue =
  string | number | boolean | null | JSONArray | JSONObject;
export type JSONArray = JSONValue[];
export interface JSONObject {
  [key: string]: JSONValue;
}

declare const jsonType: unique symbol;
export type JSONString<T> = string & { readonly [jsonType]: T };

type Jsonify<T> = T extends { toJSON(): infer R }
  ? Jsonify<R> // Date -> string, etc.
  : T extends string | number | boolean | null
    ? T
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      T extends undefined | ((...arguments_: any[]) => any) | symbol
      ? never // dropped in objects
      : T extends [unknown, ...unknown[]]
        ? { [K in keyof T]: Jsonify<T[K]> } // preserve tuples
        : T extends readonly (infer U)[]
          ? Jsonify<U>[] // undefined slots -> null is ignored here
          : T extends object
            ? JsonifyObject<T>
            : never;

type JsonifyObject<T> = {
  // drop keys whose value serializes to `never` (functions/undefined/symbols)
  [K in keyof T as [Jsonify<T[K]>] extends [never] ? never : K]: Jsonify<T[K]>;
};

/**
 * Same as JSON.stringify but with JSONString typing.
 */
export function jsonStringify<T>(
  value: T,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  replacer?: (this: any, key: string, value: any) => any,
  space?: string | number,
): JSONString<Jsonify<T>> {
  return JSON.stringify(value, replacer, space) as JSONString<Jsonify<T>>;
}

/**
 * Same as JSON.parse but with JSONString typing.
 */
export function jsonParse<T>(
  text: JSONString<T>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reviver?: (this: any, key: string, value: any) => any,
): T {
  return JSON.parse(text, reviver) as T;
}
