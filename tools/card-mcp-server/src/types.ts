export interface PoolCard {
  id: string;
  scryfallId: string;
  name: string;
  manaCost: string;
  cmc: number;
  typeLine: string;
  oracleText: string;
  colors: string[];
  colorIdentity: string[];
  power: string | null;
  toughness: string | null;
  rarity: string;
  keywords: string[];
  setCode: string;
  scryfallUri: string;
}

export interface ScryfallCard {
  id: string;
  name: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  colors: string[];
  color_identity: string[];
  power?: string;
  toughness?: string;
  rarity: string;
  keywords: string[];
  set: string;
  scryfall_uri: string;
  rulings_uri?: string;
}

export interface ScryfallRuling {
  oracle_id: string;
  source: string;
  published_at: string;
  comment: string;
}

export interface ScryfallRulingsResponse {
  data: ScryfallRuling[];
}

export type PoolStatus = 'in_pool' | 'live_fetch';
export type ResponseFormat = 'markdown' | 'json';
