import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import { InstanceEventsService } from '../../../common/realtime/instance-events.service';
import {
  withInstanceLock,
  InstanceLockTimeoutError,
} from '../../../common/utils/instance-lock';

// ---------------------------------------------------------------------------
// State definitions
// ---------------------------------------------------------------------------

export const INSTANCE_STATES = [
  'idle',
  'generating_qr',
  'waiting_scan',
  'scanned',
  'syncing',
  'connected',
  'reconnecting',
  'disconnected',
  'failed',
] as const;

export type InstanceState = (typeof INSTANCE_STATES)[number];

/**
 * Defines the allowed transitions for each state.
 * Key = current state, Value = set of valid target states.
 */
const ALLOWED_TRANSITIONS: Record<InstanceState, ReadonlySet<InstanceState>> =
  {
    idle: new Set<InstanceState>([
      'generating_qr',
      'reconnecting',
      'disconnected',
      'failed',
    ]),
    generating_qr: new Set<InstanceState>([
      'waiting_scan',
      'reconnecting',
      'disconnected',
      'failed',
    ]),
    waiting_scan: new Set<InstanceState>([
      'scanned',
      'generating_qr',
      'reconnecting',
      'disconnected',
      'failed',
    ]),
    scanned: new Set<InstanceState>([
      'syncing',
      'connected',
      'reconnecting',
      'disconnected',
      'failed',
    ]),
    syncing: new Set<InstanceState>([
      'connected',
      'reconnecting',
      'disconnected',
      'failed',
    ]),
    connected: new Set<InstanceState>([
      'reconnecting',
      'disconnected',
      'failed',
    ]),
    reconnecting: new Set<InstanceState>([
      'generating_qr',
      'connected',
      'disconnected',
      'failed',
    ]),
    disconnected: new Set<InstanceState>([
      'idle',
      'generating_qr',
      'reconnecting',
      'failed',
    ]),
    failed: new Set<InstanceState>([
      'idle',
      'generating_qr',
      'reconnecting',
      'disconnected',
    ]),
  };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StateChangeMetadata = Record<string, unknown>;

export type StateEntry = {
  state: InstanceState;
  updatedAt: string;
  metadata?: StateChangeMetadata;
};

export type StateChangeCallback = (
  instanceId: string,
  previousState: InstanceState,
  newState: InstanceState,
  metadata?: StateChangeMetadata,
) => void;

export class InvalidStateTransitionError extends Error {
  constructor(
    instanceId: string,
    from: InstanceState,
    to: InstanceState,
  ) {
    super(
      `Invalid state transition for instance "${instanceId}": ${from} -> ${to}`,
    );
    this.name = 'InvalidStateTransitionError';
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const STATE_KEY_PREFIX = 'instance:state:';
const STATE_TTL_SECONDS = 86_400 * 7; // 7 days

@Injectable()
export class InstanceConnectionManager {
  private readonly logger = new Logger(InstanceConnectionManager.name);
  private readonly stateChangeCallbacks: StateChangeCallback[] = [];

  constructor(
    private readonly redis: RedisService,
    private readonly instanceEvents: InstanceEventsService,
  ) {}

  /**
   * Transitions an instance to a new state, validating the transition
   * against the state machine rules.
   *
   * Uses a distributed lock to prevent concurrent state transitions
   * for the same instance.
   *
   * @throws InvalidStateTransitionError if the transition is not allowed
   * @throws InstanceLockTimeoutError if the lock cannot be acquired
   */
  async transition(
    instanceId: string,
    targetState: InstanceState,
    metadata?: StateChangeMetadata,
    workspaceId?: string,
  ): Promise<StateEntry> {
    return withInstanceLock(
      this.redis,
      `state:${instanceId}`,
      async () => {
        const currentEntry = await this.getStateEntry(instanceId);
        const currentState = currentEntry?.state ?? 'idle';

        // Validate transition
        const allowed = ALLOWED_TRANSITIONS[currentState];
        if (!allowed.has(targetState)) {
          throw new InvalidStateTransitionError(
            instanceId,
            currentState,
            targetState,
          );
        }

        const newEntry: StateEntry = {
          state: targetState,
          updatedAt: new Date().toISOString(),
          metadata,
        };

        // Persist to Redis
        await this.redis.setJson(
          this.stateKey(instanceId),
          newEntry,
          STATE_TTL_SECONDS,
        );

        this.logger.log(
          `Instance "${instanceId}" transitioned: ${currentState} -> ${targetState}`,
        );

        // Notify local callbacks
        for (const callback of this.stateChangeCallbacks) {
          try {
            callback(instanceId, currentState, targetState, metadata);
          } catch (error) {
            this.logger.warn(
              `State change callback error: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        // Emit realtime event for frontend fanout
        if (workspaceId) {
          this.instanceEvents.emitStateChange(
            workspaceId,
            instanceId,
            targetState,
            {
              previousState: currentState,
              ...metadata,
            },
          );
        }

        return newEntry;
      },
      {
        ttlMs: 10_000,
        retryMs: 150,
        maxWaitMs: 8_000,
        label: `state-transition:${instanceId}`,
      },
    );
  }

  /**
   * Returns the current state of an instance.
   * Defaults to 'idle' if no state is recorded.
   */
  async getState(instanceId: string): Promise<InstanceState> {
    const entry = await this.getStateEntry(instanceId);
    return entry?.state ?? 'idle';
  }

  /**
   * Returns the full state entry including metadata and timestamp.
   */
  async getStateEntry(instanceId: string): Promise<StateEntry | null> {
    return this.redis.getJson<StateEntry>(this.stateKey(instanceId));
  }

  /**
   * Registers a callback that fires on every state change.
   * Returns an unsubscribe function.
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this.stateChangeCallbacks.push(callback);

    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index !== -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Validates whether a transition from the current state to the target is allowed,
   * without actually performing it. Useful for pre-flight checks.
   */
  isTransitionAllowed(
    currentState: InstanceState,
    targetState: InstanceState,
  ): boolean {
    return ALLOWED_TRANSITIONS[currentState]?.has(targetState) ?? false;
  }

  private stateKey(instanceId: string): string {
    return `${STATE_KEY_PREFIX}${instanceId}`;
  }
}
