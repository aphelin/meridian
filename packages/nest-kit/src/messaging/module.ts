import { Module, type DynamicModule, type OnApplicationBootstrap, type OnApplicationShutdown, type OnModuleInit } from "@nestjs/common";
import { DiscoveryModule, DiscoveryService, MetadataScanner, ModuleRef } from "@nestjs/core";
import { jwtModule } from "../auth";
import { createLogger, isShuttingDown, onShutdown, registerHealthCheck, unregisterHealthCheck } from "../core";
import { MessagingAdmin, MessagingAdminController } from "./admin";
import { errorText } from "./errors";
import { KafkaMessaging } from "./kafka";
import { MESSAGING_OPTIONS, type MessagingModuleOptions } from "./options";
import { OutboxRelay } from "./relay";
import type { PrismaLike } from "./prisma";
import { OutboxWriter } from "./outbox-writer";
import { RabbitMessaging } from "./rabbit";
import {
  KAFKA_EVENT_HANDLER,
  RABBIT_COMMAND_HANDLER,
  handlerRegistry,
  type KafkaEventHandlerFn,
  type KafkaEventHandlerOptions,
  type RabbitCommandHandlerFn,
  type RabbitCommandHandlerOptions,
} from "./registry";

const log = createLogger("Messaging");

interface ProviderWrapperLike {
  instance: unknown;
  isDependencyTreeStatic(): boolean;
  metatype?: unknown;
}

/** Finds `@KafkaEventHandler` / `@RabbitCommandHandler` methods on every static provider and registers them. */
export function discoverHandlers(discovery: Pick<DiscoveryService, "getProviders">, scanner: Pick<MetadataScanner, "getAllMethodNames">): Array<() => void> {
  const unregister: Array<() => void> = [];
  const seen = new Set<object>();
  for (const wrapper of discovery.getProviders() as ProviderWrapperLike[]) {
    const instance = wrapper.instance;
    if (!instance || typeof instance !== "object" || seen.has(instance)) continue;
    if (!wrapper.isDependencyTreeStatic()) continue;
    seen.add(instance);
    const prototype = Object.getPrototypeOf(instance) as Record<string, unknown> | null;
    if (!prototype) continue;
    for (const method of scanner.getAllMethodNames(prototype)) {
      const fn = prototype[method];
      if (typeof fn !== "function") continue;
      const label = `${(instance as object).constructor?.name ?? "Provider"}.${method}`;
      const kafka = Reflect.getMetadata(KAFKA_EVENT_HANDLER, fn) as KafkaEventHandlerOptions[] | undefined;
      for (const options of kafka ?? []) {
        unregister.push(handlerRegistry.registerKafka(options, (fn as KafkaEventHandlerFn).bind(instance), label));
      }
      const rabbit = Reflect.getMetadata(RABBIT_COMMAND_HANDLER, fn) as RabbitCommandHandlerOptions | undefined;
      if (rabbit) unregister.push(handlerRegistry.registerRabbit(rabbit, (fn as RabbitCommandHandlerFn).bind(instance), label));
    }
  }
  return unregister;
}

/** Wires discovery, consumers, relay, health checks and graceful shutdown for `MessagingModule`. */
export class MessagingRuntime implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
  private prismaClient: PrismaLike | null = null;
  private unregister: Array<() => void> = [];
  private unsubscribe: (() => void) | null = null;
  private started = false;
  private stopped = false;
  private syncScheduled = false;
  readonly relay: OutboxRelay;
  readonly admin: MessagingAdmin;

  constructor(
    private readonly options: MessagingModuleOptions,
    private readonly moduleRef: ModuleRef,
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    readonly kafka: KafkaMessaging,
    readonly rabbit: RabbitMessaging,
  ) {
    const prisma = () => this.prisma();
    this.relay = new OutboxRelay(prisma, options.kafka ? kafka : null, options.rabbit ? rabbit : null);
    this.admin = new MessagingAdmin(options, prisma, options.kafka ? kafka : null, options.rabbit ? rabbit : null);
  }

  prisma(): PrismaLike {
    if (!this.prismaClient) {
      let client: PrismaLike;
      try {
        client = this.moduleRef.get(this.options.prisma, { strict: false });
      } catch (error) {
        throw new Error(`MessagingModule: ${this.options.prisma.name} is not registered as a provider (${errorText(error)})`);
      }
      this.prismaClient = client;
    }
    return this.prismaClient;
  }

  onModuleInit(): void {
    this.unregister = discoverHandlers(this.discovery, this.scanner);
    const groups = [...handlerRegistry.kafkaGroups().keys()];
    const commands = handlerRegistry.rabbitHandlers().map((handler) => handler.command);
    if (groups.length && !this.options.kafka) log.warn("Kafka handlers registered but kafka is disabled", { groups });
    if (commands.length && !this.options.rabbit) log.warn("RabbitMQ handlers registered but rabbit is disabled", { commands });
  }

  onApplicationBootstrap(): void {
    if (this.started) return;
    this.started = true;
    this.prisma();
    const { kafka, rabbit, relay } = this.options;
    if (kafka) {
      registerHealthCheck("kafka", () => this.kafka.healthCheck());
      this.kafka.startConsumers().catch((error) => log.error("kafka consumers failed to start", { error: errorText(error) }));
    }
    if (rabbit) {
      registerHealthCheck("rabbitmq", () => this.rabbit.healthCheck());
      this.rabbit.startConsumers();
    }
    if (relay) this.relay.start();
    this.unsubscribe = handlerRegistry.subscribe(() => this.scheduleSync());

    onShutdown("messaging-consumers", "consumers", () => this.stopConsumers());
    onShutdown("messaging-producers", "producers", () => this.stopProducers());
    onShutdown("messaging-connections", "resources", () => this.closeConnections());
    log.info("messaging started", { service: this.options.service, kafka, rabbit, relay });
  }

  /** Handlers registered after startup (imperative API) get their consumers started or restarted. */
  private scheduleSync(): void {
    if (this.syncScheduled || this.stopped || isShuttingDown()) return;
    this.syncScheduled = true;
    queueMicrotask(() => {
      this.syncScheduled = false;
      if (this.stopped || isShuttingDown()) return;
      if (this.options.kafka) void this.kafka.syncConsumers().catch((error) => log.error("kafka consumer sync failed", { error: errorText(error) }));
      if (this.options.rabbit) this.rabbit.startConsumers();
    });
  }

  private async stopConsumers(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    await Promise.all([this.options.kafka ? this.kafka.stopConsumers() : undefined, this.options.rabbit ? this.rabbit.stopConsumers() : undefined]);
  }

  private async stopProducers(): Promise<void> {
    await this.relay.stop();
    if (this.options.kafka) await this.kafka.disconnectProducer();
  }

  private async closeConnections(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    unregisterHealthCheck("kafka");
    unregisterHealthCheck("rabbitmq");
    await Promise.all([this.options.kafka ? this.kafka.close() : undefined, this.options.rabbit ? this.rabbit.close() : undefined]);
    for (const unregister of this.unregister.splice(0)) unregister();
  }

  /** `app.close()` outside the signal-driven shutdown (tests, scripts): run the same phases directly. */
  async onApplicationShutdown(): Promise<void> {
    if (isShuttingDown() || this.stopped || !this.started) return;
    await this.stopConsumers();
    await this.stopProducers();
    await this.closeConnections();
  }
}

/**
 * Messaging for a service: transactional outbox writer and relay, Kafka consumer groups with retries/DLT/replay,
 * RabbitMQ command consumers with retry tiers/DLQ, inbox dedupe, health checks, graceful shutdown and the
 * AdminOnly `/admin/messaging` endpoints. Global: `OutboxWriter` is injectable everywhere.
 */
@Module({})
export class MessagingModule {
  static forRoot(options: MessagingModuleOptions): DynamicModule {
    if (!options?.service) throw new Error("MessagingModule.forRoot: service is required");
    if (typeof options.prisma !== "function") throw new Error("MessagingModule.forRoot: prisma must be the service's Prisma client class");
    return {
      module: MessagingModule,
      global: true,
      imports: [DiscoveryModule, jwtModule()],
      controllers: [MessagingAdminController],
      providers: [
        { provide: MESSAGING_OPTIONS, useValue: options },
        { provide: OutboxWriter, useValue: new OutboxWriter() },
        { provide: KafkaMessaging, useFactory: () => new KafkaMessaging(options.service) },
        { provide: RabbitMessaging, useFactory: () => new RabbitMessaging(options.service) },
        {
          provide: MessagingRuntime,
          useFactory: (moduleRef: ModuleRef, discovery: DiscoveryService, scanner: MetadataScanner, kafka: KafkaMessaging, rabbit: RabbitMessaging) =>
            new MessagingRuntime(options, moduleRef, discovery, scanner, kafka, rabbit),
          inject: [ModuleRef, DiscoveryService, MetadataScanner, KafkaMessaging, RabbitMessaging],
        },
        { provide: OutboxRelay, useFactory: (runtime: MessagingRuntime) => runtime.relay, inject: [MessagingRuntime] },
        { provide: MessagingAdmin, useFactory: (runtime: MessagingRuntime) => runtime.admin, inject: [MessagingRuntime] },
      ],
      exports: [MESSAGING_OPTIONS, OutboxWriter, KafkaMessaging, RabbitMessaging, OutboxRelay, MessagingAdmin],
    };
  }
}
