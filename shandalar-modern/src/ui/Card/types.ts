export type ManaSym = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

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
}
