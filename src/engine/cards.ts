/** A card is an integer 0..51: rank * 4 + suit. */
export type Card = number;

/** Rank index 0..12 maps to 2..A. */
export const RANK_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;

/** Suit index: 0 spades, 1 hearts, 2 diamonds, 3 clubs. Twin suit is `3 - suit`. */
export const SUIT_KEYS = ['S', 'H', 'D', 'C'] as const;
export const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'] as const;
export const SUIT_NAMES = ['Spades', 'Hearts', 'Diamonds', 'Clubs'] as const;

export const ACE = 12;
export const DECK_SIZE = 52;

export const rankOf = (card: Card): number => card >> 2;
export const suitOf = (card: Card): number => card & 3;
export const makeCard = (rank: number, suit: number): Card => rank * 4 + suit;
export const isRed = (card: Card): boolean => suitOf(card) === 1 || suitOf(card) === 2;

/** Same rank, other suit of the same colour (hearts <-> diamonds, spades <-> clubs). */
export const twinOf = (card: Card): Card => makeCard(rankOf(card), 3 - suitOf(card));

export function fullDeck(): Card[] {
  return Array.from({ length: DECK_SIZE }, (_, i) => i);
}

export function cardLabel(card: Card): string {
  return `${RANK_LABELS[rankOf(card)]}${SUIT_SYMBOLS[suitOf(card)]}`;
}

export function cardName(card: Card): string {
  const rank = rankOf(card);
  const names: Record<number, string> = { 9: 'Jack', 10: 'Queen', 11: 'King', 12: 'Ace' };
  return `${names[rank] ?? RANK_LABELS[rank]} of ${SUIT_NAMES[suitOf(card)]}`;
}

const SUIT_ALIASES: Record<string, number> = {
  S: 0, '♠': 0, '♤': 0,
  H: 1, '♥': 1, '♡': 1,
  D: 2, '♦': 2, '♢': 2,
  C: 3, '♣': 3, '♧': 3,
};

/** Parses text such as "AS", "10h", "Td" or "2♦". */
export function parseCard(text: string): Card {
  const cleaned = text.trim().toUpperCase();
  const match = /^(10|[2-9TJQKA])(.)$/u.exec(cleaned);
  if (!match) throw new Error(`Cannot read card "${text}". Use a rank and a suit, for example AS, 10H, 7D or KC.`);
  const rankText = match[1] === 'T' ? '10' : match[1];
  const rank = (RANK_LABELS as readonly string[]).indexOf(rankText);
  const suit = SUIT_ALIASES[match[2]];
  if (rank < 0 || suit === undefined) {
    throw new Error(`Cannot read card "${text}". Use a rank and a suit, for example AS, 10H, 7D or KC.`);
  }
  return makeCard(rank, suit);
}

/** Highest rank first, then spades, hearts, diamonds, clubs. */
export function sortByRankDesc(cards: readonly Card[]): Card[] {
  return [...cards].sort((a, b) => rankOf(b) - rankOf(a) || suitOf(a) - suitOf(b));
}

/** Groups by suit, highest rank first within each suit. */
export function sortBySuit(cards: readonly Card[]): Card[] {
  return [...cards].sort((a, b) => suitOf(a) - suitOf(b) || rankOf(b) - rankOf(a));
}

/** Reads a list of cards separated by spaces or commas; unreadable entries are returned as `rejected`. */
export function parseCards(text: string): { cards: Card[]; rejected: string[] } {
  const cards: Card[] = [];
  const rejected: string[] = [];
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    try {
      cards.push(parseCard(token));
    } catch {
      rejected.push(token);
    }
  }
  return { cards, rejected };
}
