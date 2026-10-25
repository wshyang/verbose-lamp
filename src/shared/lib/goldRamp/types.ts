export type GoldRampId = 'bright' | 'deep' | 'champagne';

export interface GoldRampStop {
  readonly position: number;
  readonly color: string;
}

export interface GoldRampDefinition {
  readonly id: GoldRampId;
  readonly name: string;
  readonly stops: readonly GoldRampStop[];
}
