
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model Outbox
 * 
 */
export type Outbox = $Result.DefaultSelection<Prisma.$OutboxPayload>
/**
 * Model Inbox
 * 
 */
export type Inbox = $Result.DefaultSelection<Prisma.$InboxPayload>
/**
 * Model DemoHandled
 * 
 */
export type DemoHandled = $Result.DefaultSelection<Prisma.$DemoHandledPayload>

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Outboxes
 * const outboxes = await prisma.outbox.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more Outboxes
   * const outboxes = await prisma.outbox.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.outbox`: Exposes CRUD operations for the **Outbox** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Outboxes
    * const outboxes = await prisma.outbox.findMany()
    * ```
    */
  get outbox(): Prisma.OutboxDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.inbox`: Exposes CRUD operations for the **Inbox** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Inboxes
    * const inboxes = await prisma.inbox.findMany()
    * ```
    */
  get inbox(): Prisma.InboxDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.demoHandled`: Exposes CRUD operations for the **DemoHandled** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more DemoHandleds
    * const demoHandleds = await prisma.demoHandled.findMany()
    * ```
    */
  get demoHandled(): Prisma.DemoHandledDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 6.19.3
   * Query Engine version: c2990dca591cba766e3b7ef5d9e8a84796e47ab7
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import Bytes = runtime.Bytes
  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    Outbox: 'Outbox',
    Inbox: 'Inbox',
    DemoHandled: 'DemoHandled'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "outbox" | "inbox" | "demoHandled"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      Outbox: {
        payload: Prisma.$OutboxPayload<ExtArgs>
        fields: Prisma.OutboxFieldRefs
        operations: {
          findUnique: {
            args: Prisma.OutboxFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.OutboxFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxPayload>
          }
          findFirst: {
            args: Prisma.OutboxFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.OutboxFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxPayload>
          }
          findMany: {
            args: Prisma.OutboxFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxPayload>[]
          }
          create: {
            args: Prisma.OutboxCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxPayload>
          }
          createMany: {
            args: Prisma.OutboxCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.OutboxCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxPayload>[]
          }
          delete: {
            args: Prisma.OutboxDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxPayload>
          }
          update: {
            args: Prisma.OutboxUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxPayload>
          }
          deleteMany: {
            args: Prisma.OutboxDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.OutboxUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.OutboxUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxPayload>[]
          }
          upsert: {
            args: Prisma.OutboxUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxPayload>
          }
          aggregate: {
            args: Prisma.OutboxAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateOutbox>
          }
          groupBy: {
            args: Prisma.OutboxGroupByArgs<ExtArgs>
            result: $Utils.Optional<OutboxGroupByOutputType>[]
          }
          count: {
            args: Prisma.OutboxCountArgs<ExtArgs>
            result: $Utils.Optional<OutboxCountAggregateOutputType> | number
          }
        }
      }
      Inbox: {
        payload: Prisma.$InboxPayload<ExtArgs>
        fields: Prisma.InboxFieldRefs
        operations: {
          findUnique: {
            args: Prisma.InboxFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InboxPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.InboxFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InboxPayload>
          }
          findFirst: {
            args: Prisma.InboxFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InboxPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.InboxFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InboxPayload>
          }
          findMany: {
            args: Prisma.InboxFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InboxPayload>[]
          }
          create: {
            args: Prisma.InboxCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InboxPayload>
          }
          createMany: {
            args: Prisma.InboxCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.InboxCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InboxPayload>[]
          }
          delete: {
            args: Prisma.InboxDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InboxPayload>
          }
          update: {
            args: Prisma.InboxUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InboxPayload>
          }
          deleteMany: {
            args: Prisma.InboxDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.InboxUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.InboxUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InboxPayload>[]
          }
          upsert: {
            args: Prisma.InboxUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InboxPayload>
          }
          aggregate: {
            args: Prisma.InboxAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateInbox>
          }
          groupBy: {
            args: Prisma.InboxGroupByArgs<ExtArgs>
            result: $Utils.Optional<InboxGroupByOutputType>[]
          }
          count: {
            args: Prisma.InboxCountArgs<ExtArgs>
            result: $Utils.Optional<InboxCountAggregateOutputType> | number
          }
        }
      }
      DemoHandled: {
        payload: Prisma.$DemoHandledPayload<ExtArgs>
        fields: Prisma.DemoHandledFieldRefs
        operations: {
          findUnique: {
            args: Prisma.DemoHandledFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DemoHandledPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.DemoHandledFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DemoHandledPayload>
          }
          findFirst: {
            args: Prisma.DemoHandledFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DemoHandledPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.DemoHandledFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DemoHandledPayload>
          }
          findMany: {
            args: Prisma.DemoHandledFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DemoHandledPayload>[]
          }
          create: {
            args: Prisma.DemoHandledCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DemoHandledPayload>
          }
          createMany: {
            args: Prisma.DemoHandledCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.DemoHandledCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DemoHandledPayload>[]
          }
          delete: {
            args: Prisma.DemoHandledDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DemoHandledPayload>
          }
          update: {
            args: Prisma.DemoHandledUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DemoHandledPayload>
          }
          deleteMany: {
            args: Prisma.DemoHandledDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.DemoHandledUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.DemoHandledUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DemoHandledPayload>[]
          }
          upsert: {
            args: Prisma.DemoHandledUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DemoHandledPayload>
          }
          aggregate: {
            args: Prisma.DemoHandledAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateDemoHandled>
          }
          groupBy: {
            args: Prisma.DemoHandledGroupByArgs<ExtArgs>
            result: $Utils.Optional<DemoHandledGroupByOutputType>[]
          }
          count: {
            args: Prisma.DemoHandledCountArgs<ExtArgs>
            result: $Utils.Optional<DemoHandledCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     * 
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * 
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.SqlDriverAdapterFactory | null
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
  }
  export type GlobalOmitConfig = {
    outbox?: OutboxOmit
    inbox?: InboxOmit
    demoHandled?: DemoHandledOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<
    T extends LogDefinition ? T['level'] : T
  >;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
    ? GetLogType<T[number]>
    : never;

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */



  /**
   * Models
   */

  /**
   * Model Outbox
   */

  export type AggregateOutbox = {
    _count: OutboxCountAggregateOutputType | null
    _avg: OutboxAvgAggregateOutputType | null
    _sum: OutboxSumAggregateOutputType | null
    _min: OutboxMinAggregateOutputType | null
    _max: OutboxMaxAggregateOutputType | null
  }

  export type OutboxAvgAggregateOutputType = {
    attempts: number | null
  }

  export type OutboxSumAggregateOutputType = {
    attempts: number | null
  }

  export type OutboxMinAggregateOutputType = {
    id: string | null
    kind: string | null
    name: string | null
    aggregateType: string | null
    aggregateId: string | null
    correlationId: string | null
    causationId: string | null
    traceparent: string | null
    createdAt: Date | null
    publishedAt: Date | null
    attempts: number | null
    lastError: string | null
  }

  export type OutboxMaxAggregateOutputType = {
    id: string | null
    kind: string | null
    name: string | null
    aggregateType: string | null
    aggregateId: string | null
    correlationId: string | null
    causationId: string | null
    traceparent: string | null
    createdAt: Date | null
    publishedAt: Date | null
    attempts: number | null
    lastError: string | null
  }

  export type OutboxCountAggregateOutputType = {
    id: number
    kind: number
    name: number
    aggregateType: number
    aggregateId: number
    payload: number
    correlationId: number
    causationId: number
    traceparent: number
    createdAt: number
    publishedAt: number
    attempts: number
    lastError: number
    _all: number
  }


  export type OutboxAvgAggregateInputType = {
    attempts?: true
  }

  export type OutboxSumAggregateInputType = {
    attempts?: true
  }

  export type OutboxMinAggregateInputType = {
    id?: true
    kind?: true
    name?: true
    aggregateType?: true
    aggregateId?: true
    correlationId?: true
    causationId?: true
    traceparent?: true
    createdAt?: true
    publishedAt?: true
    attempts?: true
    lastError?: true
  }

  export type OutboxMaxAggregateInputType = {
    id?: true
    kind?: true
    name?: true
    aggregateType?: true
    aggregateId?: true
    correlationId?: true
    causationId?: true
    traceparent?: true
    createdAt?: true
    publishedAt?: true
    attempts?: true
    lastError?: true
  }

  export type OutboxCountAggregateInputType = {
    id?: true
    kind?: true
    name?: true
    aggregateType?: true
    aggregateId?: true
    payload?: true
    correlationId?: true
    causationId?: true
    traceparent?: true
    createdAt?: true
    publishedAt?: true
    attempts?: true
    lastError?: true
    _all?: true
  }

  export type OutboxAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Outbox to aggregate.
     */
    where?: OutboxWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Outboxes to fetch.
     */
    orderBy?: OutboxOrderByWithRelationInput | OutboxOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: OutboxWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Outboxes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Outboxes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Outboxes
    **/
    _count?: true | OutboxCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: OutboxAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: OutboxSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: OutboxMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: OutboxMaxAggregateInputType
  }

  export type GetOutboxAggregateType<T extends OutboxAggregateArgs> = {
        [P in keyof T & keyof AggregateOutbox]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateOutbox[P]>
      : GetScalarType<T[P], AggregateOutbox[P]>
  }




  export type OutboxGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: OutboxWhereInput
    orderBy?: OutboxOrderByWithAggregationInput | OutboxOrderByWithAggregationInput[]
    by: OutboxScalarFieldEnum[] | OutboxScalarFieldEnum
    having?: OutboxScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: OutboxCountAggregateInputType | true
    _avg?: OutboxAvgAggregateInputType
    _sum?: OutboxSumAggregateInputType
    _min?: OutboxMinAggregateInputType
    _max?: OutboxMaxAggregateInputType
  }

  export type OutboxGroupByOutputType = {
    id: string
    kind: string
    name: string
    aggregateType: string | null
    aggregateId: string | null
    payload: JsonValue
    correlationId: string
    causationId: string | null
    traceparent: string | null
    createdAt: Date
    publishedAt: Date | null
    attempts: number
    lastError: string | null
    _count: OutboxCountAggregateOutputType | null
    _avg: OutboxAvgAggregateOutputType | null
    _sum: OutboxSumAggregateOutputType | null
    _min: OutboxMinAggregateOutputType | null
    _max: OutboxMaxAggregateOutputType | null
  }

  type GetOutboxGroupByPayload<T extends OutboxGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<OutboxGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof OutboxGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], OutboxGroupByOutputType[P]>
            : GetScalarType<T[P], OutboxGroupByOutputType[P]>
        }
      >
    >


  export type OutboxSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    kind?: boolean
    name?: boolean
    aggregateType?: boolean
    aggregateId?: boolean
    payload?: boolean
    correlationId?: boolean
    causationId?: boolean
    traceparent?: boolean
    createdAt?: boolean
    publishedAt?: boolean
    attempts?: boolean
    lastError?: boolean
  }, ExtArgs["result"]["outbox"]>

  export type OutboxSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    kind?: boolean
    name?: boolean
    aggregateType?: boolean
    aggregateId?: boolean
    payload?: boolean
    correlationId?: boolean
    causationId?: boolean
    traceparent?: boolean
    createdAt?: boolean
    publishedAt?: boolean
    attempts?: boolean
    lastError?: boolean
  }, ExtArgs["result"]["outbox"]>

  export type OutboxSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    kind?: boolean
    name?: boolean
    aggregateType?: boolean
    aggregateId?: boolean
    payload?: boolean
    correlationId?: boolean
    causationId?: boolean
    traceparent?: boolean
    createdAt?: boolean
    publishedAt?: boolean
    attempts?: boolean
    lastError?: boolean
  }, ExtArgs["result"]["outbox"]>

  export type OutboxSelectScalar = {
    id?: boolean
    kind?: boolean
    name?: boolean
    aggregateType?: boolean
    aggregateId?: boolean
    payload?: boolean
    correlationId?: boolean
    causationId?: boolean
    traceparent?: boolean
    createdAt?: boolean
    publishedAt?: boolean
    attempts?: boolean
    lastError?: boolean
  }

  export type OutboxOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "kind" | "name" | "aggregateType" | "aggregateId" | "payload" | "correlationId" | "causationId" | "traceparent" | "createdAt" | "publishedAt" | "attempts" | "lastError", ExtArgs["result"]["outbox"]>

  export type $OutboxPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Outbox"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      kind: string
      name: string
      aggregateType: string | null
      aggregateId: string | null
      payload: Prisma.JsonValue
      correlationId: string
      causationId: string | null
      traceparent: string | null
      createdAt: Date
      publishedAt: Date | null
      attempts: number
      lastError: string | null
    }, ExtArgs["result"]["outbox"]>
    composites: {}
  }

  type OutboxGetPayload<S extends boolean | null | undefined | OutboxDefaultArgs> = $Result.GetResult<Prisma.$OutboxPayload, S>

  type OutboxCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<OutboxFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: OutboxCountAggregateInputType | true
    }

  export interface OutboxDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Outbox'], meta: { name: 'Outbox' } }
    /**
     * Find zero or one Outbox that matches the filter.
     * @param {OutboxFindUniqueArgs} args - Arguments to find a Outbox
     * @example
     * // Get one Outbox
     * const outbox = await prisma.outbox.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends OutboxFindUniqueArgs>(args: SelectSubset<T, OutboxFindUniqueArgs<ExtArgs>>): Prisma__OutboxClient<$Result.GetResult<Prisma.$OutboxPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Outbox that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {OutboxFindUniqueOrThrowArgs} args - Arguments to find a Outbox
     * @example
     * // Get one Outbox
     * const outbox = await prisma.outbox.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends OutboxFindUniqueOrThrowArgs>(args: SelectSubset<T, OutboxFindUniqueOrThrowArgs<ExtArgs>>): Prisma__OutboxClient<$Result.GetResult<Prisma.$OutboxPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Outbox that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxFindFirstArgs} args - Arguments to find a Outbox
     * @example
     * // Get one Outbox
     * const outbox = await prisma.outbox.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends OutboxFindFirstArgs>(args?: SelectSubset<T, OutboxFindFirstArgs<ExtArgs>>): Prisma__OutboxClient<$Result.GetResult<Prisma.$OutboxPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Outbox that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxFindFirstOrThrowArgs} args - Arguments to find a Outbox
     * @example
     * // Get one Outbox
     * const outbox = await prisma.outbox.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends OutboxFindFirstOrThrowArgs>(args?: SelectSubset<T, OutboxFindFirstOrThrowArgs<ExtArgs>>): Prisma__OutboxClient<$Result.GetResult<Prisma.$OutboxPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Outboxes that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Outboxes
     * const outboxes = await prisma.outbox.findMany()
     * 
     * // Get first 10 Outboxes
     * const outboxes = await prisma.outbox.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const outboxWithIdOnly = await prisma.outbox.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends OutboxFindManyArgs>(args?: SelectSubset<T, OutboxFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OutboxPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Outbox.
     * @param {OutboxCreateArgs} args - Arguments to create a Outbox.
     * @example
     * // Create one Outbox
     * const Outbox = await prisma.outbox.create({
     *   data: {
     *     // ... data to create a Outbox
     *   }
     * })
     * 
     */
    create<T extends OutboxCreateArgs>(args: SelectSubset<T, OutboxCreateArgs<ExtArgs>>): Prisma__OutboxClient<$Result.GetResult<Prisma.$OutboxPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Outboxes.
     * @param {OutboxCreateManyArgs} args - Arguments to create many Outboxes.
     * @example
     * // Create many Outboxes
     * const outbox = await prisma.outbox.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends OutboxCreateManyArgs>(args?: SelectSubset<T, OutboxCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Outboxes and returns the data saved in the database.
     * @param {OutboxCreateManyAndReturnArgs} args - Arguments to create many Outboxes.
     * @example
     * // Create many Outboxes
     * const outbox = await prisma.outbox.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Outboxes and only return the `id`
     * const outboxWithIdOnly = await prisma.outbox.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends OutboxCreateManyAndReturnArgs>(args?: SelectSubset<T, OutboxCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OutboxPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Outbox.
     * @param {OutboxDeleteArgs} args - Arguments to delete one Outbox.
     * @example
     * // Delete one Outbox
     * const Outbox = await prisma.outbox.delete({
     *   where: {
     *     // ... filter to delete one Outbox
     *   }
     * })
     * 
     */
    delete<T extends OutboxDeleteArgs>(args: SelectSubset<T, OutboxDeleteArgs<ExtArgs>>): Prisma__OutboxClient<$Result.GetResult<Prisma.$OutboxPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Outbox.
     * @param {OutboxUpdateArgs} args - Arguments to update one Outbox.
     * @example
     * // Update one Outbox
     * const outbox = await prisma.outbox.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends OutboxUpdateArgs>(args: SelectSubset<T, OutboxUpdateArgs<ExtArgs>>): Prisma__OutboxClient<$Result.GetResult<Prisma.$OutboxPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Outboxes.
     * @param {OutboxDeleteManyArgs} args - Arguments to filter Outboxes to delete.
     * @example
     * // Delete a few Outboxes
     * const { count } = await prisma.outbox.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends OutboxDeleteManyArgs>(args?: SelectSubset<T, OutboxDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Outboxes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Outboxes
     * const outbox = await prisma.outbox.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends OutboxUpdateManyArgs>(args: SelectSubset<T, OutboxUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Outboxes and returns the data updated in the database.
     * @param {OutboxUpdateManyAndReturnArgs} args - Arguments to update many Outboxes.
     * @example
     * // Update many Outboxes
     * const outbox = await prisma.outbox.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Outboxes and only return the `id`
     * const outboxWithIdOnly = await prisma.outbox.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends OutboxUpdateManyAndReturnArgs>(args: SelectSubset<T, OutboxUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OutboxPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Outbox.
     * @param {OutboxUpsertArgs} args - Arguments to update or create a Outbox.
     * @example
     * // Update or create a Outbox
     * const outbox = await prisma.outbox.upsert({
     *   create: {
     *     // ... data to create a Outbox
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Outbox we want to update
     *   }
     * })
     */
    upsert<T extends OutboxUpsertArgs>(args: SelectSubset<T, OutboxUpsertArgs<ExtArgs>>): Prisma__OutboxClient<$Result.GetResult<Prisma.$OutboxPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Outboxes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxCountArgs} args - Arguments to filter Outboxes to count.
     * @example
     * // Count the number of Outboxes
     * const count = await prisma.outbox.count({
     *   where: {
     *     // ... the filter for the Outboxes we want to count
     *   }
     * })
    **/
    count<T extends OutboxCountArgs>(
      args?: Subset<T, OutboxCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], OutboxCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Outbox.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends OutboxAggregateArgs>(args: Subset<T, OutboxAggregateArgs>): Prisma.PrismaPromise<GetOutboxAggregateType<T>>

    /**
     * Group by Outbox.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends OutboxGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: OutboxGroupByArgs['orderBy'] }
        : { orderBy?: OutboxGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, OutboxGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetOutboxGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Outbox model
   */
  readonly fields: OutboxFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Outbox.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__OutboxClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Outbox model
   */
  interface OutboxFieldRefs {
    readonly id: FieldRef<"Outbox", 'String'>
    readonly kind: FieldRef<"Outbox", 'String'>
    readonly name: FieldRef<"Outbox", 'String'>
    readonly aggregateType: FieldRef<"Outbox", 'String'>
    readonly aggregateId: FieldRef<"Outbox", 'String'>
    readonly payload: FieldRef<"Outbox", 'Json'>
    readonly correlationId: FieldRef<"Outbox", 'String'>
    readonly causationId: FieldRef<"Outbox", 'String'>
    readonly traceparent: FieldRef<"Outbox", 'String'>
    readonly createdAt: FieldRef<"Outbox", 'DateTime'>
    readonly publishedAt: FieldRef<"Outbox", 'DateTime'>
    readonly attempts: FieldRef<"Outbox", 'Int'>
    readonly lastError: FieldRef<"Outbox", 'String'>
  }
    

  // Custom InputTypes
  /**
   * Outbox findUnique
   */
  export type OutboxFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Outbox
     */
    select?: OutboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Outbox
     */
    omit?: OutboxOmit<ExtArgs> | null
    /**
     * Filter, which Outbox to fetch.
     */
    where: OutboxWhereUniqueInput
  }

  /**
   * Outbox findUniqueOrThrow
   */
  export type OutboxFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Outbox
     */
    select?: OutboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Outbox
     */
    omit?: OutboxOmit<ExtArgs> | null
    /**
     * Filter, which Outbox to fetch.
     */
    where: OutboxWhereUniqueInput
  }

  /**
   * Outbox findFirst
   */
  export type OutboxFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Outbox
     */
    select?: OutboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Outbox
     */
    omit?: OutboxOmit<ExtArgs> | null
    /**
     * Filter, which Outbox to fetch.
     */
    where?: OutboxWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Outboxes to fetch.
     */
    orderBy?: OutboxOrderByWithRelationInput | OutboxOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Outboxes.
     */
    cursor?: OutboxWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Outboxes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Outboxes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Outboxes.
     */
    distinct?: OutboxScalarFieldEnum | OutboxScalarFieldEnum[]
  }

  /**
   * Outbox findFirstOrThrow
   */
  export type OutboxFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Outbox
     */
    select?: OutboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Outbox
     */
    omit?: OutboxOmit<ExtArgs> | null
    /**
     * Filter, which Outbox to fetch.
     */
    where?: OutboxWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Outboxes to fetch.
     */
    orderBy?: OutboxOrderByWithRelationInput | OutboxOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Outboxes.
     */
    cursor?: OutboxWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Outboxes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Outboxes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Outboxes.
     */
    distinct?: OutboxScalarFieldEnum | OutboxScalarFieldEnum[]
  }

  /**
   * Outbox findMany
   */
  export type OutboxFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Outbox
     */
    select?: OutboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Outbox
     */
    omit?: OutboxOmit<ExtArgs> | null
    /**
     * Filter, which Outboxes to fetch.
     */
    where?: OutboxWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Outboxes to fetch.
     */
    orderBy?: OutboxOrderByWithRelationInput | OutboxOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Outboxes.
     */
    cursor?: OutboxWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Outboxes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Outboxes.
     */
    skip?: number
    distinct?: OutboxScalarFieldEnum | OutboxScalarFieldEnum[]
  }

  /**
   * Outbox create
   */
  export type OutboxCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Outbox
     */
    select?: OutboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Outbox
     */
    omit?: OutboxOmit<ExtArgs> | null
    /**
     * The data needed to create a Outbox.
     */
    data: XOR<OutboxCreateInput, OutboxUncheckedCreateInput>
  }

  /**
   * Outbox createMany
   */
  export type OutboxCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Outboxes.
     */
    data: OutboxCreateManyInput | OutboxCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Outbox createManyAndReturn
   */
  export type OutboxCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Outbox
     */
    select?: OutboxSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Outbox
     */
    omit?: OutboxOmit<ExtArgs> | null
    /**
     * The data used to create many Outboxes.
     */
    data: OutboxCreateManyInput | OutboxCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Outbox update
   */
  export type OutboxUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Outbox
     */
    select?: OutboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Outbox
     */
    omit?: OutboxOmit<ExtArgs> | null
    /**
     * The data needed to update a Outbox.
     */
    data: XOR<OutboxUpdateInput, OutboxUncheckedUpdateInput>
    /**
     * Choose, which Outbox to update.
     */
    where: OutboxWhereUniqueInput
  }

  /**
   * Outbox updateMany
   */
  export type OutboxUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Outboxes.
     */
    data: XOR<OutboxUpdateManyMutationInput, OutboxUncheckedUpdateManyInput>
    /**
     * Filter which Outboxes to update
     */
    where?: OutboxWhereInput
    /**
     * Limit how many Outboxes to update.
     */
    limit?: number
  }

  /**
   * Outbox updateManyAndReturn
   */
  export type OutboxUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Outbox
     */
    select?: OutboxSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Outbox
     */
    omit?: OutboxOmit<ExtArgs> | null
    /**
     * The data used to update Outboxes.
     */
    data: XOR<OutboxUpdateManyMutationInput, OutboxUncheckedUpdateManyInput>
    /**
     * Filter which Outboxes to update
     */
    where?: OutboxWhereInput
    /**
     * Limit how many Outboxes to update.
     */
    limit?: number
  }

  /**
   * Outbox upsert
   */
  export type OutboxUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Outbox
     */
    select?: OutboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Outbox
     */
    omit?: OutboxOmit<ExtArgs> | null
    /**
     * The filter to search for the Outbox to update in case it exists.
     */
    where: OutboxWhereUniqueInput
    /**
     * In case the Outbox found by the `where` argument doesn't exist, create a new Outbox with this data.
     */
    create: XOR<OutboxCreateInput, OutboxUncheckedCreateInput>
    /**
     * In case the Outbox was found with the provided `where` argument, update it with this data.
     */
    update: XOR<OutboxUpdateInput, OutboxUncheckedUpdateInput>
  }

  /**
   * Outbox delete
   */
  export type OutboxDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Outbox
     */
    select?: OutboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Outbox
     */
    omit?: OutboxOmit<ExtArgs> | null
    /**
     * Filter which Outbox to delete.
     */
    where: OutboxWhereUniqueInput
  }

  /**
   * Outbox deleteMany
   */
  export type OutboxDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Outboxes to delete
     */
    where?: OutboxWhereInput
    /**
     * Limit how many Outboxes to delete.
     */
    limit?: number
  }

  /**
   * Outbox without action
   */
  export type OutboxDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Outbox
     */
    select?: OutboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Outbox
     */
    omit?: OutboxOmit<ExtArgs> | null
  }


  /**
   * Model Inbox
   */

  export type AggregateInbox = {
    _count: InboxCountAggregateOutputType | null
    _min: InboxMinAggregateOutputType | null
    _max: InboxMaxAggregateOutputType | null
  }

  export type InboxMinAggregateOutputType = {
    messageId: string | null
    consumer: string | null
    processedAt: Date | null
  }

  export type InboxMaxAggregateOutputType = {
    messageId: string | null
    consumer: string | null
    processedAt: Date | null
  }

  export type InboxCountAggregateOutputType = {
    messageId: number
    consumer: number
    processedAt: number
    _all: number
  }


  export type InboxMinAggregateInputType = {
    messageId?: true
    consumer?: true
    processedAt?: true
  }

  export type InboxMaxAggregateInputType = {
    messageId?: true
    consumer?: true
    processedAt?: true
  }

  export type InboxCountAggregateInputType = {
    messageId?: true
    consumer?: true
    processedAt?: true
    _all?: true
  }

  export type InboxAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Inbox to aggregate.
     */
    where?: InboxWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Inboxes to fetch.
     */
    orderBy?: InboxOrderByWithRelationInput | InboxOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: InboxWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Inboxes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Inboxes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Inboxes
    **/
    _count?: true | InboxCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: InboxMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: InboxMaxAggregateInputType
  }

  export type GetInboxAggregateType<T extends InboxAggregateArgs> = {
        [P in keyof T & keyof AggregateInbox]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateInbox[P]>
      : GetScalarType<T[P], AggregateInbox[P]>
  }




  export type InboxGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: InboxWhereInput
    orderBy?: InboxOrderByWithAggregationInput | InboxOrderByWithAggregationInput[]
    by: InboxScalarFieldEnum[] | InboxScalarFieldEnum
    having?: InboxScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: InboxCountAggregateInputType | true
    _min?: InboxMinAggregateInputType
    _max?: InboxMaxAggregateInputType
  }

  export type InboxGroupByOutputType = {
    messageId: string
    consumer: string
    processedAt: Date
    _count: InboxCountAggregateOutputType | null
    _min: InboxMinAggregateOutputType | null
    _max: InboxMaxAggregateOutputType | null
  }

  type GetInboxGroupByPayload<T extends InboxGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<InboxGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof InboxGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], InboxGroupByOutputType[P]>
            : GetScalarType<T[P], InboxGroupByOutputType[P]>
        }
      >
    >


  export type InboxSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    messageId?: boolean
    consumer?: boolean
    processedAt?: boolean
  }, ExtArgs["result"]["inbox"]>

  export type InboxSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    messageId?: boolean
    consumer?: boolean
    processedAt?: boolean
  }, ExtArgs["result"]["inbox"]>

  export type InboxSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    messageId?: boolean
    consumer?: boolean
    processedAt?: boolean
  }, ExtArgs["result"]["inbox"]>

  export type InboxSelectScalar = {
    messageId?: boolean
    consumer?: boolean
    processedAt?: boolean
  }

  export type InboxOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"messageId" | "consumer" | "processedAt", ExtArgs["result"]["inbox"]>

  export type $InboxPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Inbox"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      messageId: string
      consumer: string
      processedAt: Date
    }, ExtArgs["result"]["inbox"]>
    composites: {}
  }

  type InboxGetPayload<S extends boolean | null | undefined | InboxDefaultArgs> = $Result.GetResult<Prisma.$InboxPayload, S>

  type InboxCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<InboxFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: InboxCountAggregateInputType | true
    }

  export interface InboxDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Inbox'], meta: { name: 'Inbox' } }
    /**
     * Find zero or one Inbox that matches the filter.
     * @param {InboxFindUniqueArgs} args - Arguments to find a Inbox
     * @example
     * // Get one Inbox
     * const inbox = await prisma.inbox.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends InboxFindUniqueArgs>(args: SelectSubset<T, InboxFindUniqueArgs<ExtArgs>>): Prisma__InboxClient<$Result.GetResult<Prisma.$InboxPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Inbox that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {InboxFindUniqueOrThrowArgs} args - Arguments to find a Inbox
     * @example
     * // Get one Inbox
     * const inbox = await prisma.inbox.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends InboxFindUniqueOrThrowArgs>(args: SelectSubset<T, InboxFindUniqueOrThrowArgs<ExtArgs>>): Prisma__InboxClient<$Result.GetResult<Prisma.$InboxPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Inbox that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {InboxFindFirstArgs} args - Arguments to find a Inbox
     * @example
     * // Get one Inbox
     * const inbox = await prisma.inbox.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends InboxFindFirstArgs>(args?: SelectSubset<T, InboxFindFirstArgs<ExtArgs>>): Prisma__InboxClient<$Result.GetResult<Prisma.$InboxPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Inbox that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {InboxFindFirstOrThrowArgs} args - Arguments to find a Inbox
     * @example
     * // Get one Inbox
     * const inbox = await prisma.inbox.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends InboxFindFirstOrThrowArgs>(args?: SelectSubset<T, InboxFindFirstOrThrowArgs<ExtArgs>>): Prisma__InboxClient<$Result.GetResult<Prisma.$InboxPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Inboxes that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {InboxFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Inboxes
     * const inboxes = await prisma.inbox.findMany()
     * 
     * // Get first 10 Inboxes
     * const inboxes = await prisma.inbox.findMany({ take: 10 })
     * 
     * // Only select the `messageId`
     * const inboxWithMessageIdOnly = await prisma.inbox.findMany({ select: { messageId: true } })
     * 
     */
    findMany<T extends InboxFindManyArgs>(args?: SelectSubset<T, InboxFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$InboxPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Inbox.
     * @param {InboxCreateArgs} args - Arguments to create a Inbox.
     * @example
     * // Create one Inbox
     * const Inbox = await prisma.inbox.create({
     *   data: {
     *     // ... data to create a Inbox
     *   }
     * })
     * 
     */
    create<T extends InboxCreateArgs>(args: SelectSubset<T, InboxCreateArgs<ExtArgs>>): Prisma__InboxClient<$Result.GetResult<Prisma.$InboxPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Inboxes.
     * @param {InboxCreateManyArgs} args - Arguments to create many Inboxes.
     * @example
     * // Create many Inboxes
     * const inbox = await prisma.inbox.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends InboxCreateManyArgs>(args?: SelectSubset<T, InboxCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Inboxes and returns the data saved in the database.
     * @param {InboxCreateManyAndReturnArgs} args - Arguments to create many Inboxes.
     * @example
     * // Create many Inboxes
     * const inbox = await prisma.inbox.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Inboxes and only return the `messageId`
     * const inboxWithMessageIdOnly = await prisma.inbox.createManyAndReturn({
     *   select: { messageId: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends InboxCreateManyAndReturnArgs>(args?: SelectSubset<T, InboxCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$InboxPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Inbox.
     * @param {InboxDeleteArgs} args - Arguments to delete one Inbox.
     * @example
     * // Delete one Inbox
     * const Inbox = await prisma.inbox.delete({
     *   where: {
     *     // ... filter to delete one Inbox
     *   }
     * })
     * 
     */
    delete<T extends InboxDeleteArgs>(args: SelectSubset<T, InboxDeleteArgs<ExtArgs>>): Prisma__InboxClient<$Result.GetResult<Prisma.$InboxPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Inbox.
     * @param {InboxUpdateArgs} args - Arguments to update one Inbox.
     * @example
     * // Update one Inbox
     * const inbox = await prisma.inbox.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends InboxUpdateArgs>(args: SelectSubset<T, InboxUpdateArgs<ExtArgs>>): Prisma__InboxClient<$Result.GetResult<Prisma.$InboxPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Inboxes.
     * @param {InboxDeleteManyArgs} args - Arguments to filter Inboxes to delete.
     * @example
     * // Delete a few Inboxes
     * const { count } = await prisma.inbox.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends InboxDeleteManyArgs>(args?: SelectSubset<T, InboxDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Inboxes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {InboxUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Inboxes
     * const inbox = await prisma.inbox.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends InboxUpdateManyArgs>(args: SelectSubset<T, InboxUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Inboxes and returns the data updated in the database.
     * @param {InboxUpdateManyAndReturnArgs} args - Arguments to update many Inboxes.
     * @example
     * // Update many Inboxes
     * const inbox = await prisma.inbox.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Inboxes and only return the `messageId`
     * const inboxWithMessageIdOnly = await prisma.inbox.updateManyAndReturn({
     *   select: { messageId: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends InboxUpdateManyAndReturnArgs>(args: SelectSubset<T, InboxUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$InboxPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Inbox.
     * @param {InboxUpsertArgs} args - Arguments to update or create a Inbox.
     * @example
     * // Update or create a Inbox
     * const inbox = await prisma.inbox.upsert({
     *   create: {
     *     // ... data to create a Inbox
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Inbox we want to update
     *   }
     * })
     */
    upsert<T extends InboxUpsertArgs>(args: SelectSubset<T, InboxUpsertArgs<ExtArgs>>): Prisma__InboxClient<$Result.GetResult<Prisma.$InboxPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Inboxes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {InboxCountArgs} args - Arguments to filter Inboxes to count.
     * @example
     * // Count the number of Inboxes
     * const count = await prisma.inbox.count({
     *   where: {
     *     // ... the filter for the Inboxes we want to count
     *   }
     * })
    **/
    count<T extends InboxCountArgs>(
      args?: Subset<T, InboxCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], InboxCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Inbox.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {InboxAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends InboxAggregateArgs>(args: Subset<T, InboxAggregateArgs>): Prisma.PrismaPromise<GetInboxAggregateType<T>>

    /**
     * Group by Inbox.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {InboxGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends InboxGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: InboxGroupByArgs['orderBy'] }
        : { orderBy?: InboxGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, InboxGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetInboxGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Inbox model
   */
  readonly fields: InboxFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Inbox.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__InboxClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Inbox model
   */
  interface InboxFieldRefs {
    readonly messageId: FieldRef<"Inbox", 'String'>
    readonly consumer: FieldRef<"Inbox", 'String'>
    readonly processedAt: FieldRef<"Inbox", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Inbox findUnique
   */
  export type InboxFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Inbox
     */
    select?: InboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Inbox
     */
    omit?: InboxOmit<ExtArgs> | null
    /**
     * Filter, which Inbox to fetch.
     */
    where: InboxWhereUniqueInput
  }

  /**
   * Inbox findUniqueOrThrow
   */
  export type InboxFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Inbox
     */
    select?: InboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Inbox
     */
    omit?: InboxOmit<ExtArgs> | null
    /**
     * Filter, which Inbox to fetch.
     */
    where: InboxWhereUniqueInput
  }

  /**
   * Inbox findFirst
   */
  export type InboxFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Inbox
     */
    select?: InboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Inbox
     */
    omit?: InboxOmit<ExtArgs> | null
    /**
     * Filter, which Inbox to fetch.
     */
    where?: InboxWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Inboxes to fetch.
     */
    orderBy?: InboxOrderByWithRelationInput | InboxOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Inboxes.
     */
    cursor?: InboxWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Inboxes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Inboxes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Inboxes.
     */
    distinct?: InboxScalarFieldEnum | InboxScalarFieldEnum[]
  }

  /**
   * Inbox findFirstOrThrow
   */
  export type InboxFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Inbox
     */
    select?: InboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Inbox
     */
    omit?: InboxOmit<ExtArgs> | null
    /**
     * Filter, which Inbox to fetch.
     */
    where?: InboxWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Inboxes to fetch.
     */
    orderBy?: InboxOrderByWithRelationInput | InboxOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Inboxes.
     */
    cursor?: InboxWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Inboxes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Inboxes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Inboxes.
     */
    distinct?: InboxScalarFieldEnum | InboxScalarFieldEnum[]
  }

  /**
   * Inbox findMany
   */
  export type InboxFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Inbox
     */
    select?: InboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Inbox
     */
    omit?: InboxOmit<ExtArgs> | null
    /**
     * Filter, which Inboxes to fetch.
     */
    where?: InboxWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Inboxes to fetch.
     */
    orderBy?: InboxOrderByWithRelationInput | InboxOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Inboxes.
     */
    cursor?: InboxWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Inboxes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Inboxes.
     */
    skip?: number
    distinct?: InboxScalarFieldEnum | InboxScalarFieldEnum[]
  }

  /**
   * Inbox create
   */
  export type InboxCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Inbox
     */
    select?: InboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Inbox
     */
    omit?: InboxOmit<ExtArgs> | null
    /**
     * The data needed to create a Inbox.
     */
    data: XOR<InboxCreateInput, InboxUncheckedCreateInput>
  }

  /**
   * Inbox createMany
   */
  export type InboxCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Inboxes.
     */
    data: InboxCreateManyInput | InboxCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Inbox createManyAndReturn
   */
  export type InboxCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Inbox
     */
    select?: InboxSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Inbox
     */
    omit?: InboxOmit<ExtArgs> | null
    /**
     * The data used to create many Inboxes.
     */
    data: InboxCreateManyInput | InboxCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Inbox update
   */
  export type InboxUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Inbox
     */
    select?: InboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Inbox
     */
    omit?: InboxOmit<ExtArgs> | null
    /**
     * The data needed to update a Inbox.
     */
    data: XOR<InboxUpdateInput, InboxUncheckedUpdateInput>
    /**
     * Choose, which Inbox to update.
     */
    where: InboxWhereUniqueInput
  }

  /**
   * Inbox updateMany
   */
  export type InboxUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Inboxes.
     */
    data: XOR<InboxUpdateManyMutationInput, InboxUncheckedUpdateManyInput>
    /**
     * Filter which Inboxes to update
     */
    where?: InboxWhereInput
    /**
     * Limit how many Inboxes to update.
     */
    limit?: number
  }

  /**
   * Inbox updateManyAndReturn
   */
  export type InboxUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Inbox
     */
    select?: InboxSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Inbox
     */
    omit?: InboxOmit<ExtArgs> | null
    /**
     * The data used to update Inboxes.
     */
    data: XOR<InboxUpdateManyMutationInput, InboxUncheckedUpdateManyInput>
    /**
     * Filter which Inboxes to update
     */
    where?: InboxWhereInput
    /**
     * Limit how many Inboxes to update.
     */
    limit?: number
  }

  /**
   * Inbox upsert
   */
  export type InboxUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Inbox
     */
    select?: InboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Inbox
     */
    omit?: InboxOmit<ExtArgs> | null
    /**
     * The filter to search for the Inbox to update in case it exists.
     */
    where: InboxWhereUniqueInput
    /**
     * In case the Inbox found by the `where` argument doesn't exist, create a new Inbox with this data.
     */
    create: XOR<InboxCreateInput, InboxUncheckedCreateInput>
    /**
     * In case the Inbox was found with the provided `where` argument, update it with this data.
     */
    update: XOR<InboxUpdateInput, InboxUncheckedUpdateInput>
  }

  /**
   * Inbox delete
   */
  export type InboxDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Inbox
     */
    select?: InboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Inbox
     */
    omit?: InboxOmit<ExtArgs> | null
    /**
     * Filter which Inbox to delete.
     */
    where: InboxWhereUniqueInput
  }

  /**
   * Inbox deleteMany
   */
  export type InboxDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Inboxes to delete
     */
    where?: InboxWhereInput
    /**
     * Limit how many Inboxes to delete.
     */
    limit?: number
  }

  /**
   * Inbox without action
   */
  export type InboxDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Inbox
     */
    select?: InboxSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Inbox
     */
    omit?: InboxOmit<ExtArgs> | null
  }


  /**
   * Model DemoHandled
   */

  export type AggregateDemoHandled = {
    _count: DemoHandledCountAggregateOutputType | null
    _avg: DemoHandledAvgAggregateOutputType | null
    _sum: DemoHandledSumAggregateOutputType | null
    _min: DemoHandledMinAggregateOutputType | null
    _max: DemoHandledMaxAggregateOutputType | null
  }

  export type DemoHandledAvgAggregateOutputType = {
    attempt: number | null
  }

  export type DemoHandledSumAggregateOutputType = {
    attempt: number | null
  }

  export type DemoHandledMinAggregateOutputType = {
    id: string | null
    consumer: string | null
    messageId: string | null
    correlationId: string | null
    instanceId: string | null
    attempt: number | null
    handledAt: Date | null
  }

  export type DemoHandledMaxAggregateOutputType = {
    id: string | null
    consumer: string | null
    messageId: string | null
    correlationId: string | null
    instanceId: string | null
    attempt: number | null
    handledAt: Date | null
  }

  export type DemoHandledCountAggregateOutputType = {
    id: number
    consumer: number
    messageId: number
    correlationId: number
    instanceId: number
    attempt: number
    handledAt: number
    _all: number
  }


  export type DemoHandledAvgAggregateInputType = {
    attempt?: true
  }

  export type DemoHandledSumAggregateInputType = {
    attempt?: true
  }

  export type DemoHandledMinAggregateInputType = {
    id?: true
    consumer?: true
    messageId?: true
    correlationId?: true
    instanceId?: true
    attempt?: true
    handledAt?: true
  }

  export type DemoHandledMaxAggregateInputType = {
    id?: true
    consumer?: true
    messageId?: true
    correlationId?: true
    instanceId?: true
    attempt?: true
    handledAt?: true
  }

  export type DemoHandledCountAggregateInputType = {
    id?: true
    consumer?: true
    messageId?: true
    correlationId?: true
    instanceId?: true
    attempt?: true
    handledAt?: true
    _all?: true
  }

  export type DemoHandledAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which DemoHandled to aggregate.
     */
    where?: DemoHandledWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DemoHandleds to fetch.
     */
    orderBy?: DemoHandledOrderByWithRelationInput | DemoHandledOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: DemoHandledWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DemoHandleds from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DemoHandleds.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned DemoHandleds
    **/
    _count?: true | DemoHandledCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: DemoHandledAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: DemoHandledSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: DemoHandledMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: DemoHandledMaxAggregateInputType
  }

  export type GetDemoHandledAggregateType<T extends DemoHandledAggregateArgs> = {
        [P in keyof T & keyof AggregateDemoHandled]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateDemoHandled[P]>
      : GetScalarType<T[P], AggregateDemoHandled[P]>
  }




  export type DemoHandledGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: DemoHandledWhereInput
    orderBy?: DemoHandledOrderByWithAggregationInput | DemoHandledOrderByWithAggregationInput[]
    by: DemoHandledScalarFieldEnum[] | DemoHandledScalarFieldEnum
    having?: DemoHandledScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: DemoHandledCountAggregateInputType | true
    _avg?: DemoHandledAvgAggregateInputType
    _sum?: DemoHandledSumAggregateInputType
    _min?: DemoHandledMinAggregateInputType
    _max?: DemoHandledMaxAggregateInputType
  }

  export type DemoHandledGroupByOutputType = {
    id: string
    consumer: string
    messageId: string
    correlationId: string
    instanceId: string
    attempt: number
    handledAt: Date
    _count: DemoHandledCountAggregateOutputType | null
    _avg: DemoHandledAvgAggregateOutputType | null
    _sum: DemoHandledSumAggregateOutputType | null
    _min: DemoHandledMinAggregateOutputType | null
    _max: DemoHandledMaxAggregateOutputType | null
  }

  type GetDemoHandledGroupByPayload<T extends DemoHandledGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<DemoHandledGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof DemoHandledGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], DemoHandledGroupByOutputType[P]>
            : GetScalarType<T[P], DemoHandledGroupByOutputType[P]>
        }
      >
    >


  export type DemoHandledSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    consumer?: boolean
    messageId?: boolean
    correlationId?: boolean
    instanceId?: boolean
    attempt?: boolean
    handledAt?: boolean
  }, ExtArgs["result"]["demoHandled"]>

  export type DemoHandledSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    consumer?: boolean
    messageId?: boolean
    correlationId?: boolean
    instanceId?: boolean
    attempt?: boolean
    handledAt?: boolean
  }, ExtArgs["result"]["demoHandled"]>

  export type DemoHandledSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    consumer?: boolean
    messageId?: boolean
    correlationId?: boolean
    instanceId?: boolean
    attempt?: boolean
    handledAt?: boolean
  }, ExtArgs["result"]["demoHandled"]>

  export type DemoHandledSelectScalar = {
    id?: boolean
    consumer?: boolean
    messageId?: boolean
    correlationId?: boolean
    instanceId?: boolean
    attempt?: boolean
    handledAt?: boolean
  }

  export type DemoHandledOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "consumer" | "messageId" | "correlationId" | "instanceId" | "attempt" | "handledAt", ExtArgs["result"]["demoHandled"]>

  export type $DemoHandledPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "DemoHandled"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      consumer: string
      messageId: string
      correlationId: string
      instanceId: string
      attempt: number
      handledAt: Date
    }, ExtArgs["result"]["demoHandled"]>
    composites: {}
  }

  type DemoHandledGetPayload<S extends boolean | null | undefined | DemoHandledDefaultArgs> = $Result.GetResult<Prisma.$DemoHandledPayload, S>

  type DemoHandledCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<DemoHandledFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: DemoHandledCountAggregateInputType | true
    }

  export interface DemoHandledDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['DemoHandled'], meta: { name: 'DemoHandled' } }
    /**
     * Find zero or one DemoHandled that matches the filter.
     * @param {DemoHandledFindUniqueArgs} args - Arguments to find a DemoHandled
     * @example
     * // Get one DemoHandled
     * const demoHandled = await prisma.demoHandled.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends DemoHandledFindUniqueArgs>(args: SelectSubset<T, DemoHandledFindUniqueArgs<ExtArgs>>): Prisma__DemoHandledClient<$Result.GetResult<Prisma.$DemoHandledPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one DemoHandled that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {DemoHandledFindUniqueOrThrowArgs} args - Arguments to find a DemoHandled
     * @example
     * // Get one DemoHandled
     * const demoHandled = await prisma.demoHandled.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends DemoHandledFindUniqueOrThrowArgs>(args: SelectSubset<T, DemoHandledFindUniqueOrThrowArgs<ExtArgs>>): Prisma__DemoHandledClient<$Result.GetResult<Prisma.$DemoHandledPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first DemoHandled that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DemoHandledFindFirstArgs} args - Arguments to find a DemoHandled
     * @example
     * // Get one DemoHandled
     * const demoHandled = await prisma.demoHandled.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends DemoHandledFindFirstArgs>(args?: SelectSubset<T, DemoHandledFindFirstArgs<ExtArgs>>): Prisma__DemoHandledClient<$Result.GetResult<Prisma.$DemoHandledPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first DemoHandled that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DemoHandledFindFirstOrThrowArgs} args - Arguments to find a DemoHandled
     * @example
     * // Get one DemoHandled
     * const demoHandled = await prisma.demoHandled.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends DemoHandledFindFirstOrThrowArgs>(args?: SelectSubset<T, DemoHandledFindFirstOrThrowArgs<ExtArgs>>): Prisma__DemoHandledClient<$Result.GetResult<Prisma.$DemoHandledPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more DemoHandleds that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DemoHandledFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all DemoHandleds
     * const demoHandleds = await prisma.demoHandled.findMany()
     * 
     * // Get first 10 DemoHandleds
     * const demoHandleds = await prisma.demoHandled.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const demoHandledWithIdOnly = await prisma.demoHandled.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends DemoHandledFindManyArgs>(args?: SelectSubset<T, DemoHandledFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DemoHandledPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a DemoHandled.
     * @param {DemoHandledCreateArgs} args - Arguments to create a DemoHandled.
     * @example
     * // Create one DemoHandled
     * const DemoHandled = await prisma.demoHandled.create({
     *   data: {
     *     // ... data to create a DemoHandled
     *   }
     * })
     * 
     */
    create<T extends DemoHandledCreateArgs>(args: SelectSubset<T, DemoHandledCreateArgs<ExtArgs>>): Prisma__DemoHandledClient<$Result.GetResult<Prisma.$DemoHandledPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many DemoHandleds.
     * @param {DemoHandledCreateManyArgs} args - Arguments to create many DemoHandleds.
     * @example
     * // Create many DemoHandleds
     * const demoHandled = await prisma.demoHandled.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends DemoHandledCreateManyArgs>(args?: SelectSubset<T, DemoHandledCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many DemoHandleds and returns the data saved in the database.
     * @param {DemoHandledCreateManyAndReturnArgs} args - Arguments to create many DemoHandleds.
     * @example
     * // Create many DemoHandleds
     * const demoHandled = await prisma.demoHandled.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many DemoHandleds and only return the `id`
     * const demoHandledWithIdOnly = await prisma.demoHandled.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends DemoHandledCreateManyAndReturnArgs>(args?: SelectSubset<T, DemoHandledCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DemoHandledPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a DemoHandled.
     * @param {DemoHandledDeleteArgs} args - Arguments to delete one DemoHandled.
     * @example
     * // Delete one DemoHandled
     * const DemoHandled = await prisma.demoHandled.delete({
     *   where: {
     *     // ... filter to delete one DemoHandled
     *   }
     * })
     * 
     */
    delete<T extends DemoHandledDeleteArgs>(args: SelectSubset<T, DemoHandledDeleteArgs<ExtArgs>>): Prisma__DemoHandledClient<$Result.GetResult<Prisma.$DemoHandledPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one DemoHandled.
     * @param {DemoHandledUpdateArgs} args - Arguments to update one DemoHandled.
     * @example
     * // Update one DemoHandled
     * const demoHandled = await prisma.demoHandled.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends DemoHandledUpdateArgs>(args: SelectSubset<T, DemoHandledUpdateArgs<ExtArgs>>): Prisma__DemoHandledClient<$Result.GetResult<Prisma.$DemoHandledPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more DemoHandleds.
     * @param {DemoHandledDeleteManyArgs} args - Arguments to filter DemoHandleds to delete.
     * @example
     * // Delete a few DemoHandleds
     * const { count } = await prisma.demoHandled.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends DemoHandledDeleteManyArgs>(args?: SelectSubset<T, DemoHandledDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more DemoHandleds.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DemoHandledUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many DemoHandleds
     * const demoHandled = await prisma.demoHandled.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends DemoHandledUpdateManyArgs>(args: SelectSubset<T, DemoHandledUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more DemoHandleds and returns the data updated in the database.
     * @param {DemoHandledUpdateManyAndReturnArgs} args - Arguments to update many DemoHandleds.
     * @example
     * // Update many DemoHandleds
     * const demoHandled = await prisma.demoHandled.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more DemoHandleds and only return the `id`
     * const demoHandledWithIdOnly = await prisma.demoHandled.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends DemoHandledUpdateManyAndReturnArgs>(args: SelectSubset<T, DemoHandledUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DemoHandledPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one DemoHandled.
     * @param {DemoHandledUpsertArgs} args - Arguments to update or create a DemoHandled.
     * @example
     * // Update or create a DemoHandled
     * const demoHandled = await prisma.demoHandled.upsert({
     *   create: {
     *     // ... data to create a DemoHandled
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the DemoHandled we want to update
     *   }
     * })
     */
    upsert<T extends DemoHandledUpsertArgs>(args: SelectSubset<T, DemoHandledUpsertArgs<ExtArgs>>): Prisma__DemoHandledClient<$Result.GetResult<Prisma.$DemoHandledPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of DemoHandleds.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DemoHandledCountArgs} args - Arguments to filter DemoHandleds to count.
     * @example
     * // Count the number of DemoHandleds
     * const count = await prisma.demoHandled.count({
     *   where: {
     *     // ... the filter for the DemoHandleds we want to count
     *   }
     * })
    **/
    count<T extends DemoHandledCountArgs>(
      args?: Subset<T, DemoHandledCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], DemoHandledCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a DemoHandled.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DemoHandledAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends DemoHandledAggregateArgs>(args: Subset<T, DemoHandledAggregateArgs>): Prisma.PrismaPromise<GetDemoHandledAggregateType<T>>

    /**
     * Group by DemoHandled.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DemoHandledGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends DemoHandledGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: DemoHandledGroupByArgs['orderBy'] }
        : { orderBy?: DemoHandledGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, DemoHandledGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetDemoHandledGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the DemoHandled model
   */
  readonly fields: DemoHandledFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for DemoHandled.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__DemoHandledClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the DemoHandled model
   */
  interface DemoHandledFieldRefs {
    readonly id: FieldRef<"DemoHandled", 'String'>
    readonly consumer: FieldRef<"DemoHandled", 'String'>
    readonly messageId: FieldRef<"DemoHandled", 'String'>
    readonly correlationId: FieldRef<"DemoHandled", 'String'>
    readonly instanceId: FieldRef<"DemoHandled", 'String'>
    readonly attempt: FieldRef<"DemoHandled", 'Int'>
    readonly handledAt: FieldRef<"DemoHandled", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * DemoHandled findUnique
   */
  export type DemoHandledFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DemoHandled
     */
    select?: DemoHandledSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DemoHandled
     */
    omit?: DemoHandledOmit<ExtArgs> | null
    /**
     * Filter, which DemoHandled to fetch.
     */
    where: DemoHandledWhereUniqueInput
  }

  /**
   * DemoHandled findUniqueOrThrow
   */
  export type DemoHandledFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DemoHandled
     */
    select?: DemoHandledSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DemoHandled
     */
    omit?: DemoHandledOmit<ExtArgs> | null
    /**
     * Filter, which DemoHandled to fetch.
     */
    where: DemoHandledWhereUniqueInput
  }

  /**
   * DemoHandled findFirst
   */
  export type DemoHandledFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DemoHandled
     */
    select?: DemoHandledSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DemoHandled
     */
    omit?: DemoHandledOmit<ExtArgs> | null
    /**
     * Filter, which DemoHandled to fetch.
     */
    where?: DemoHandledWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DemoHandleds to fetch.
     */
    orderBy?: DemoHandledOrderByWithRelationInput | DemoHandledOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for DemoHandleds.
     */
    cursor?: DemoHandledWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DemoHandleds from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DemoHandleds.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of DemoHandleds.
     */
    distinct?: DemoHandledScalarFieldEnum | DemoHandledScalarFieldEnum[]
  }

  /**
   * DemoHandled findFirstOrThrow
   */
  export type DemoHandledFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DemoHandled
     */
    select?: DemoHandledSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DemoHandled
     */
    omit?: DemoHandledOmit<ExtArgs> | null
    /**
     * Filter, which DemoHandled to fetch.
     */
    where?: DemoHandledWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DemoHandleds to fetch.
     */
    orderBy?: DemoHandledOrderByWithRelationInput | DemoHandledOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for DemoHandleds.
     */
    cursor?: DemoHandledWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DemoHandleds from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DemoHandleds.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of DemoHandleds.
     */
    distinct?: DemoHandledScalarFieldEnum | DemoHandledScalarFieldEnum[]
  }

  /**
   * DemoHandled findMany
   */
  export type DemoHandledFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DemoHandled
     */
    select?: DemoHandledSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DemoHandled
     */
    omit?: DemoHandledOmit<ExtArgs> | null
    /**
     * Filter, which DemoHandleds to fetch.
     */
    where?: DemoHandledWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DemoHandleds to fetch.
     */
    orderBy?: DemoHandledOrderByWithRelationInput | DemoHandledOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing DemoHandleds.
     */
    cursor?: DemoHandledWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DemoHandleds from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DemoHandleds.
     */
    skip?: number
    distinct?: DemoHandledScalarFieldEnum | DemoHandledScalarFieldEnum[]
  }

  /**
   * DemoHandled create
   */
  export type DemoHandledCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DemoHandled
     */
    select?: DemoHandledSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DemoHandled
     */
    omit?: DemoHandledOmit<ExtArgs> | null
    /**
     * The data needed to create a DemoHandled.
     */
    data: XOR<DemoHandledCreateInput, DemoHandledUncheckedCreateInput>
  }

  /**
   * DemoHandled createMany
   */
  export type DemoHandledCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many DemoHandleds.
     */
    data: DemoHandledCreateManyInput | DemoHandledCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * DemoHandled createManyAndReturn
   */
  export type DemoHandledCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DemoHandled
     */
    select?: DemoHandledSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the DemoHandled
     */
    omit?: DemoHandledOmit<ExtArgs> | null
    /**
     * The data used to create many DemoHandleds.
     */
    data: DemoHandledCreateManyInput | DemoHandledCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * DemoHandled update
   */
  export type DemoHandledUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DemoHandled
     */
    select?: DemoHandledSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DemoHandled
     */
    omit?: DemoHandledOmit<ExtArgs> | null
    /**
     * The data needed to update a DemoHandled.
     */
    data: XOR<DemoHandledUpdateInput, DemoHandledUncheckedUpdateInput>
    /**
     * Choose, which DemoHandled to update.
     */
    where: DemoHandledWhereUniqueInput
  }

  /**
   * DemoHandled updateMany
   */
  export type DemoHandledUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update DemoHandleds.
     */
    data: XOR<DemoHandledUpdateManyMutationInput, DemoHandledUncheckedUpdateManyInput>
    /**
     * Filter which DemoHandleds to update
     */
    where?: DemoHandledWhereInput
    /**
     * Limit how many DemoHandleds to update.
     */
    limit?: number
  }

  /**
   * DemoHandled updateManyAndReturn
   */
  export type DemoHandledUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DemoHandled
     */
    select?: DemoHandledSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the DemoHandled
     */
    omit?: DemoHandledOmit<ExtArgs> | null
    /**
     * The data used to update DemoHandleds.
     */
    data: XOR<DemoHandledUpdateManyMutationInput, DemoHandledUncheckedUpdateManyInput>
    /**
     * Filter which DemoHandleds to update
     */
    where?: DemoHandledWhereInput
    /**
     * Limit how many DemoHandleds to update.
     */
    limit?: number
  }

  /**
   * DemoHandled upsert
   */
  export type DemoHandledUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DemoHandled
     */
    select?: DemoHandledSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DemoHandled
     */
    omit?: DemoHandledOmit<ExtArgs> | null
    /**
     * The filter to search for the DemoHandled to update in case it exists.
     */
    where: DemoHandledWhereUniqueInput
    /**
     * In case the DemoHandled found by the `where` argument doesn't exist, create a new DemoHandled with this data.
     */
    create: XOR<DemoHandledCreateInput, DemoHandledUncheckedCreateInput>
    /**
     * In case the DemoHandled was found with the provided `where` argument, update it with this data.
     */
    update: XOR<DemoHandledUpdateInput, DemoHandledUncheckedUpdateInput>
  }

  /**
   * DemoHandled delete
   */
  export type DemoHandledDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DemoHandled
     */
    select?: DemoHandledSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DemoHandled
     */
    omit?: DemoHandledOmit<ExtArgs> | null
    /**
     * Filter which DemoHandled to delete.
     */
    where: DemoHandledWhereUniqueInput
  }

  /**
   * DemoHandled deleteMany
   */
  export type DemoHandledDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which DemoHandleds to delete
     */
    where?: DemoHandledWhereInput
    /**
     * Limit how many DemoHandleds to delete.
     */
    limit?: number
  }

  /**
   * DemoHandled without action
   */
  export type DemoHandledDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DemoHandled
     */
    select?: DemoHandledSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DemoHandled
     */
    omit?: DemoHandledOmit<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const OutboxScalarFieldEnum: {
    id: 'id',
    kind: 'kind',
    name: 'name',
    aggregateType: 'aggregateType',
    aggregateId: 'aggregateId',
    payload: 'payload',
    correlationId: 'correlationId',
    causationId: 'causationId',
    traceparent: 'traceparent',
    createdAt: 'createdAt',
    publishedAt: 'publishedAt',
    attempts: 'attempts',
    lastError: 'lastError'
  };

  export type OutboxScalarFieldEnum = (typeof OutboxScalarFieldEnum)[keyof typeof OutboxScalarFieldEnum]


  export const InboxScalarFieldEnum: {
    messageId: 'messageId',
    consumer: 'consumer',
    processedAt: 'processedAt'
  };

  export type InboxScalarFieldEnum = (typeof InboxScalarFieldEnum)[keyof typeof InboxScalarFieldEnum]


  export const DemoHandledScalarFieldEnum: {
    id: 'id',
    consumer: 'consumer',
    messageId: 'messageId',
    correlationId: 'correlationId',
    instanceId: 'instanceId',
    attempt: 'attempt',
    handledAt: 'handledAt'
  };

  export type DemoHandledScalarFieldEnum = (typeof DemoHandledScalarFieldEnum)[keyof typeof DemoHandledScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const JsonNullValueInput: {
    JsonNull: typeof JsonNull
  };

  export type JsonNullValueInput = (typeof JsonNullValueInput)[keyof typeof JsonNullValueInput]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const JsonNullValueFilter: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull,
    AnyNull: typeof AnyNull
  };

  export type JsonNullValueFilter = (typeof JsonNullValueFilter)[keyof typeof JsonNullValueFilter]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'Json'
   */
  export type JsonFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Json'>
    


  /**
   * Reference to a field of type 'QueryMode'
   */
  export type EnumQueryModeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'QueryMode'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type OutboxWhereInput = {
    AND?: OutboxWhereInput | OutboxWhereInput[]
    OR?: OutboxWhereInput[]
    NOT?: OutboxWhereInput | OutboxWhereInput[]
    id?: StringFilter<"Outbox"> | string
    kind?: StringFilter<"Outbox"> | string
    name?: StringFilter<"Outbox"> | string
    aggregateType?: StringNullableFilter<"Outbox"> | string | null
    aggregateId?: StringNullableFilter<"Outbox"> | string | null
    payload?: JsonFilter<"Outbox">
    correlationId?: StringFilter<"Outbox"> | string
    causationId?: StringNullableFilter<"Outbox"> | string | null
    traceparent?: StringNullableFilter<"Outbox"> | string | null
    createdAt?: DateTimeFilter<"Outbox"> | Date | string
    publishedAt?: DateTimeNullableFilter<"Outbox"> | Date | string | null
    attempts?: IntFilter<"Outbox"> | number
    lastError?: StringNullableFilter<"Outbox"> | string | null
  }

  export type OutboxOrderByWithRelationInput = {
    id?: SortOrder
    kind?: SortOrder
    name?: SortOrder
    aggregateType?: SortOrderInput | SortOrder
    aggregateId?: SortOrderInput | SortOrder
    payload?: SortOrder
    correlationId?: SortOrder
    causationId?: SortOrderInput | SortOrder
    traceparent?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    publishedAt?: SortOrderInput | SortOrder
    attempts?: SortOrder
    lastError?: SortOrderInput | SortOrder
  }

  export type OutboxWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: OutboxWhereInput | OutboxWhereInput[]
    OR?: OutboxWhereInput[]
    NOT?: OutboxWhereInput | OutboxWhereInput[]
    kind?: StringFilter<"Outbox"> | string
    name?: StringFilter<"Outbox"> | string
    aggregateType?: StringNullableFilter<"Outbox"> | string | null
    aggregateId?: StringNullableFilter<"Outbox"> | string | null
    payload?: JsonFilter<"Outbox">
    correlationId?: StringFilter<"Outbox"> | string
    causationId?: StringNullableFilter<"Outbox"> | string | null
    traceparent?: StringNullableFilter<"Outbox"> | string | null
    createdAt?: DateTimeFilter<"Outbox"> | Date | string
    publishedAt?: DateTimeNullableFilter<"Outbox"> | Date | string | null
    attempts?: IntFilter<"Outbox"> | number
    lastError?: StringNullableFilter<"Outbox"> | string | null
  }, "id">

  export type OutboxOrderByWithAggregationInput = {
    id?: SortOrder
    kind?: SortOrder
    name?: SortOrder
    aggregateType?: SortOrderInput | SortOrder
    aggregateId?: SortOrderInput | SortOrder
    payload?: SortOrder
    correlationId?: SortOrder
    causationId?: SortOrderInput | SortOrder
    traceparent?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    publishedAt?: SortOrderInput | SortOrder
    attempts?: SortOrder
    lastError?: SortOrderInput | SortOrder
    _count?: OutboxCountOrderByAggregateInput
    _avg?: OutboxAvgOrderByAggregateInput
    _max?: OutboxMaxOrderByAggregateInput
    _min?: OutboxMinOrderByAggregateInput
    _sum?: OutboxSumOrderByAggregateInput
  }

  export type OutboxScalarWhereWithAggregatesInput = {
    AND?: OutboxScalarWhereWithAggregatesInput | OutboxScalarWhereWithAggregatesInput[]
    OR?: OutboxScalarWhereWithAggregatesInput[]
    NOT?: OutboxScalarWhereWithAggregatesInput | OutboxScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Outbox"> | string
    kind?: StringWithAggregatesFilter<"Outbox"> | string
    name?: StringWithAggregatesFilter<"Outbox"> | string
    aggregateType?: StringNullableWithAggregatesFilter<"Outbox"> | string | null
    aggregateId?: StringNullableWithAggregatesFilter<"Outbox"> | string | null
    payload?: JsonWithAggregatesFilter<"Outbox">
    correlationId?: StringWithAggregatesFilter<"Outbox"> | string
    causationId?: StringNullableWithAggregatesFilter<"Outbox"> | string | null
    traceparent?: StringNullableWithAggregatesFilter<"Outbox"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"Outbox"> | Date | string
    publishedAt?: DateTimeNullableWithAggregatesFilter<"Outbox"> | Date | string | null
    attempts?: IntWithAggregatesFilter<"Outbox"> | number
    lastError?: StringNullableWithAggregatesFilter<"Outbox"> | string | null
  }

  export type InboxWhereInput = {
    AND?: InboxWhereInput | InboxWhereInput[]
    OR?: InboxWhereInput[]
    NOT?: InboxWhereInput | InboxWhereInput[]
    messageId?: StringFilter<"Inbox"> | string
    consumer?: StringFilter<"Inbox"> | string
    processedAt?: DateTimeFilter<"Inbox"> | Date | string
  }

  export type InboxOrderByWithRelationInput = {
    messageId?: SortOrder
    consumer?: SortOrder
    processedAt?: SortOrder
  }

  export type InboxWhereUniqueInput = Prisma.AtLeast<{
    messageId_consumer?: InboxMessageIdConsumerCompoundUniqueInput
    AND?: InboxWhereInput | InboxWhereInput[]
    OR?: InboxWhereInput[]
    NOT?: InboxWhereInput | InboxWhereInput[]
    messageId?: StringFilter<"Inbox"> | string
    consumer?: StringFilter<"Inbox"> | string
    processedAt?: DateTimeFilter<"Inbox"> | Date | string
  }, "messageId_consumer">

  export type InboxOrderByWithAggregationInput = {
    messageId?: SortOrder
    consumer?: SortOrder
    processedAt?: SortOrder
    _count?: InboxCountOrderByAggregateInput
    _max?: InboxMaxOrderByAggregateInput
    _min?: InboxMinOrderByAggregateInput
  }

  export type InboxScalarWhereWithAggregatesInput = {
    AND?: InboxScalarWhereWithAggregatesInput | InboxScalarWhereWithAggregatesInput[]
    OR?: InboxScalarWhereWithAggregatesInput[]
    NOT?: InboxScalarWhereWithAggregatesInput | InboxScalarWhereWithAggregatesInput[]
    messageId?: StringWithAggregatesFilter<"Inbox"> | string
    consumer?: StringWithAggregatesFilter<"Inbox"> | string
    processedAt?: DateTimeWithAggregatesFilter<"Inbox"> | Date | string
  }

  export type DemoHandledWhereInput = {
    AND?: DemoHandledWhereInput | DemoHandledWhereInput[]
    OR?: DemoHandledWhereInput[]
    NOT?: DemoHandledWhereInput | DemoHandledWhereInput[]
    id?: StringFilter<"DemoHandled"> | string
    consumer?: StringFilter<"DemoHandled"> | string
    messageId?: StringFilter<"DemoHandled"> | string
    correlationId?: StringFilter<"DemoHandled"> | string
    instanceId?: StringFilter<"DemoHandled"> | string
    attempt?: IntFilter<"DemoHandled"> | number
    handledAt?: DateTimeFilter<"DemoHandled"> | Date | string
  }

  export type DemoHandledOrderByWithRelationInput = {
    id?: SortOrder
    consumer?: SortOrder
    messageId?: SortOrder
    correlationId?: SortOrder
    instanceId?: SortOrder
    attempt?: SortOrder
    handledAt?: SortOrder
  }

  export type DemoHandledWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: DemoHandledWhereInput | DemoHandledWhereInput[]
    OR?: DemoHandledWhereInput[]
    NOT?: DemoHandledWhereInput | DemoHandledWhereInput[]
    consumer?: StringFilter<"DemoHandled"> | string
    messageId?: StringFilter<"DemoHandled"> | string
    correlationId?: StringFilter<"DemoHandled"> | string
    instanceId?: StringFilter<"DemoHandled"> | string
    attempt?: IntFilter<"DemoHandled"> | number
    handledAt?: DateTimeFilter<"DemoHandled"> | Date | string
  }, "id">

  export type DemoHandledOrderByWithAggregationInput = {
    id?: SortOrder
    consumer?: SortOrder
    messageId?: SortOrder
    correlationId?: SortOrder
    instanceId?: SortOrder
    attempt?: SortOrder
    handledAt?: SortOrder
    _count?: DemoHandledCountOrderByAggregateInput
    _avg?: DemoHandledAvgOrderByAggregateInput
    _max?: DemoHandledMaxOrderByAggregateInput
    _min?: DemoHandledMinOrderByAggregateInput
    _sum?: DemoHandledSumOrderByAggregateInput
  }

  export type DemoHandledScalarWhereWithAggregatesInput = {
    AND?: DemoHandledScalarWhereWithAggregatesInput | DemoHandledScalarWhereWithAggregatesInput[]
    OR?: DemoHandledScalarWhereWithAggregatesInput[]
    NOT?: DemoHandledScalarWhereWithAggregatesInput | DemoHandledScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"DemoHandled"> | string
    consumer?: StringWithAggregatesFilter<"DemoHandled"> | string
    messageId?: StringWithAggregatesFilter<"DemoHandled"> | string
    correlationId?: StringWithAggregatesFilter<"DemoHandled"> | string
    instanceId?: StringWithAggregatesFilter<"DemoHandled"> | string
    attempt?: IntWithAggregatesFilter<"DemoHandled"> | number
    handledAt?: DateTimeWithAggregatesFilter<"DemoHandled"> | Date | string
  }

  export type OutboxCreateInput = {
    id: string
    kind: string
    name: string
    aggregateType?: string | null
    aggregateId?: string | null
    payload: JsonNullValueInput | InputJsonValue
    correlationId: string
    causationId?: string | null
    traceparent?: string | null
    createdAt?: Date | string
    publishedAt?: Date | string | null
    attempts?: number
    lastError?: string | null
  }

  export type OutboxUncheckedCreateInput = {
    id: string
    kind: string
    name: string
    aggregateType?: string | null
    aggregateId?: string | null
    payload: JsonNullValueInput | InputJsonValue
    correlationId: string
    causationId?: string | null
    traceparent?: string | null
    createdAt?: Date | string
    publishedAt?: Date | string | null
    attempts?: number
    lastError?: string | null
  }

  export type OutboxUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    kind?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    aggregateType?: NullableStringFieldUpdateOperationsInput | string | null
    aggregateId?: NullableStringFieldUpdateOperationsInput | string | null
    payload?: JsonNullValueInput | InputJsonValue
    correlationId?: StringFieldUpdateOperationsInput | string
    causationId?: NullableStringFieldUpdateOperationsInput | string | null
    traceparent?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    publishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    attempts?: IntFieldUpdateOperationsInput | number
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type OutboxUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    kind?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    aggregateType?: NullableStringFieldUpdateOperationsInput | string | null
    aggregateId?: NullableStringFieldUpdateOperationsInput | string | null
    payload?: JsonNullValueInput | InputJsonValue
    correlationId?: StringFieldUpdateOperationsInput | string
    causationId?: NullableStringFieldUpdateOperationsInput | string | null
    traceparent?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    publishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    attempts?: IntFieldUpdateOperationsInput | number
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type OutboxCreateManyInput = {
    id: string
    kind: string
    name: string
    aggregateType?: string | null
    aggregateId?: string | null
    payload: JsonNullValueInput | InputJsonValue
    correlationId: string
    causationId?: string | null
    traceparent?: string | null
    createdAt?: Date | string
    publishedAt?: Date | string | null
    attempts?: number
    lastError?: string | null
  }

  export type OutboxUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    kind?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    aggregateType?: NullableStringFieldUpdateOperationsInput | string | null
    aggregateId?: NullableStringFieldUpdateOperationsInput | string | null
    payload?: JsonNullValueInput | InputJsonValue
    correlationId?: StringFieldUpdateOperationsInput | string
    causationId?: NullableStringFieldUpdateOperationsInput | string | null
    traceparent?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    publishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    attempts?: IntFieldUpdateOperationsInput | number
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type OutboxUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    kind?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    aggregateType?: NullableStringFieldUpdateOperationsInput | string | null
    aggregateId?: NullableStringFieldUpdateOperationsInput | string | null
    payload?: JsonNullValueInput | InputJsonValue
    correlationId?: StringFieldUpdateOperationsInput | string
    causationId?: NullableStringFieldUpdateOperationsInput | string | null
    traceparent?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    publishedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    attempts?: IntFieldUpdateOperationsInput | number
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type InboxCreateInput = {
    messageId: string
    consumer: string
    processedAt?: Date | string
  }

  export type InboxUncheckedCreateInput = {
    messageId: string
    consumer: string
    processedAt?: Date | string
  }

  export type InboxUpdateInput = {
    messageId?: StringFieldUpdateOperationsInput | string
    consumer?: StringFieldUpdateOperationsInput | string
    processedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type InboxUncheckedUpdateInput = {
    messageId?: StringFieldUpdateOperationsInput | string
    consumer?: StringFieldUpdateOperationsInput | string
    processedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type InboxCreateManyInput = {
    messageId: string
    consumer: string
    processedAt?: Date | string
  }

  export type InboxUpdateManyMutationInput = {
    messageId?: StringFieldUpdateOperationsInput | string
    consumer?: StringFieldUpdateOperationsInput | string
    processedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type InboxUncheckedUpdateManyInput = {
    messageId?: StringFieldUpdateOperationsInput | string
    consumer?: StringFieldUpdateOperationsInput | string
    processedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type DemoHandledCreateInput = {
    id?: string
    consumer: string
    messageId: string
    correlationId: string
    instanceId: string
    attempt: number
    handledAt?: Date | string
  }

  export type DemoHandledUncheckedCreateInput = {
    id?: string
    consumer: string
    messageId: string
    correlationId: string
    instanceId: string
    attempt: number
    handledAt?: Date | string
  }

  export type DemoHandledUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    consumer?: StringFieldUpdateOperationsInput | string
    messageId?: StringFieldUpdateOperationsInput | string
    correlationId?: StringFieldUpdateOperationsInput | string
    instanceId?: StringFieldUpdateOperationsInput | string
    attempt?: IntFieldUpdateOperationsInput | number
    handledAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type DemoHandledUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    consumer?: StringFieldUpdateOperationsInput | string
    messageId?: StringFieldUpdateOperationsInput | string
    correlationId?: StringFieldUpdateOperationsInput | string
    instanceId?: StringFieldUpdateOperationsInput | string
    attempt?: IntFieldUpdateOperationsInput | number
    handledAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type DemoHandledCreateManyInput = {
    id?: string
    consumer: string
    messageId: string
    correlationId: string
    instanceId: string
    attempt: number
    handledAt?: Date | string
  }

  export type DemoHandledUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    consumer?: StringFieldUpdateOperationsInput | string
    messageId?: StringFieldUpdateOperationsInput | string
    correlationId?: StringFieldUpdateOperationsInput | string
    instanceId?: StringFieldUpdateOperationsInput | string
    attempt?: IntFieldUpdateOperationsInput | number
    handledAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type DemoHandledUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    consumer?: StringFieldUpdateOperationsInput | string
    messageId?: StringFieldUpdateOperationsInput | string
    correlationId?: StringFieldUpdateOperationsInput | string
    instanceId?: StringFieldUpdateOperationsInput | string
    attempt?: IntFieldUpdateOperationsInput | number
    handledAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }
  export type JsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonFilterBase<$PrismaModel>>, 'path'>>

  export type JsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type OutboxCountOrderByAggregateInput = {
    id?: SortOrder
    kind?: SortOrder
    name?: SortOrder
    aggregateType?: SortOrder
    aggregateId?: SortOrder
    payload?: SortOrder
    correlationId?: SortOrder
    causationId?: SortOrder
    traceparent?: SortOrder
    createdAt?: SortOrder
    publishedAt?: SortOrder
    attempts?: SortOrder
    lastError?: SortOrder
  }

  export type OutboxAvgOrderByAggregateInput = {
    attempts?: SortOrder
  }

  export type OutboxMaxOrderByAggregateInput = {
    id?: SortOrder
    kind?: SortOrder
    name?: SortOrder
    aggregateType?: SortOrder
    aggregateId?: SortOrder
    correlationId?: SortOrder
    causationId?: SortOrder
    traceparent?: SortOrder
    createdAt?: SortOrder
    publishedAt?: SortOrder
    attempts?: SortOrder
    lastError?: SortOrder
  }

  export type OutboxMinOrderByAggregateInput = {
    id?: SortOrder
    kind?: SortOrder
    name?: SortOrder
    aggregateType?: SortOrder
    aggregateId?: SortOrder
    correlationId?: SortOrder
    causationId?: SortOrder
    traceparent?: SortOrder
    createdAt?: SortOrder
    publishedAt?: SortOrder
    attempts?: SortOrder
    lastError?: SortOrder
  }

  export type OutboxSumOrderByAggregateInput = {
    attempts?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }
  export type JsonWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedJsonFilter<$PrismaModel>
    _max?: NestedJsonFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type InboxMessageIdConsumerCompoundUniqueInput = {
    messageId: string
    consumer: string
  }

  export type InboxCountOrderByAggregateInput = {
    messageId?: SortOrder
    consumer?: SortOrder
    processedAt?: SortOrder
  }

  export type InboxMaxOrderByAggregateInput = {
    messageId?: SortOrder
    consumer?: SortOrder
    processedAt?: SortOrder
  }

  export type InboxMinOrderByAggregateInput = {
    messageId?: SortOrder
    consumer?: SortOrder
    processedAt?: SortOrder
  }

  export type DemoHandledCountOrderByAggregateInput = {
    id?: SortOrder
    consumer?: SortOrder
    messageId?: SortOrder
    correlationId?: SortOrder
    instanceId?: SortOrder
    attempt?: SortOrder
    handledAt?: SortOrder
  }

  export type DemoHandledAvgOrderByAggregateInput = {
    attempt?: SortOrder
  }

  export type DemoHandledMaxOrderByAggregateInput = {
    id?: SortOrder
    consumer?: SortOrder
    messageId?: SortOrder
    correlationId?: SortOrder
    instanceId?: SortOrder
    attempt?: SortOrder
    handledAt?: SortOrder
  }

  export type DemoHandledMinOrderByAggregateInput = {
    id?: SortOrder
    consumer?: SortOrder
    messageId?: SortOrder
    correlationId?: SortOrder
    instanceId?: SortOrder
    attempt?: SortOrder
    handledAt?: SortOrder
  }

  export type DemoHandledSumOrderByAggregateInput = {
    attempt?: SortOrder
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }
  export type NestedJsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<NestedJsonFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}