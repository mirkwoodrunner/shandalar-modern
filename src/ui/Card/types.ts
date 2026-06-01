export type ManaSym = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

export interface AuraRecord {
  iid: string;
  name: string;
  mod: Record<string, unknown>;
  controller: string;
  cardData: {
    color?: string;
    text?: string;
    [key: string]: unknown;
  };
}

export interface CardData {
  iid: string;
  name: string;
  type: string;
  color?: string;
  cost?: string;
  text?: string;
  subtype?: string;
  power?: number;
  toughness?: number;
  tapped?: boolean;
  damage?: number;
  summoningSick?: boolean;
  produces?: string[];
  enchantments?: AuraRecord[];
}
