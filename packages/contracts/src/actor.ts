export type ActorType = 'human' | 'ai' | 'system';

export interface Actor {
  readonly type: ActorType;
  readonly id: string;
  readonly displayName?: string;
}
