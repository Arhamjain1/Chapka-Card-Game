# Chapka

Chapka is a 3-player card game played with a standard 52-card deck. Each player
arranges their hand into 5 sets of 3 cards, and the sets are then played against
each other over 5 rounds of increasing value.

This document records the rules and the optimiser requirement as agreed. The game
and the optimiser built from it are described in the [README](../README.md).

## 1. The deal

- 3 players, one standard 52-card deck, no jokers.
- Each player is dealt 17 cards (51 cards in total).
- The 1 remaining card is opened face-up at the centre.

### Who picks up the centre card

The centre card goes to the player who holds its twin: the card of the same rank
in the other suit of the same colour.

| Centre card suit | Twin suit |
| ---------------- | --------- |
| Hearts           | Diamonds  |
| Diamonds         | Hearts    |
| Spades           | Clubs     |
| Clubs            | Spades    |

Examples:

- Centre card 2 of hearts: the player holding 2 of diamonds picks it up.
- Centre card ace of spades: the player holding ace of clubs picks it up.

After the pickup, one player holds 18 cards and the other two hold 17 each.

## 2. Making sets

- Every player makes 5 sets of 3 cards, using 15 cards.
- The remaining cards are discarded:
  - the two players with 17 cards discard 2 cards each;
  - the player who picked up the centre card (18 cards) discards 3 cards.
- Any 3 cards form a valid set. The weakest type is simply "high card".

### Ordering rule

The 5 sets must be arranged in descending order of strength: the strongest set is
played in round 1 and the weakest in round 5. This is a fixed rule and cannot be
overridden.

## 3. Set ranking

Card ranks, high to low: A, K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3, 2.

Set types, strongest first:

| #   | Type            | Description                                  |
| --- | --------------- | -------------------------------------------- |
| 1   | Three of a kind | 3 cards of the same rank                     |
| 2   | Pure sequence   | 3 consecutive ranks, all of the same suit    |
| 3   | Impure sequence | 3 consecutive ranks, not all of the same suit |
| 4   | Suite           | 3 cards of the same suit, not a sequence     |
| 5   | Pair            | 2 cards of the same rank                     |
| 6   | High card       | None of the above                            |

### Within three of a kind

A-A-A is the highest, then K-K-K, and so on down to 2-2-2, which is the lowest.

### Within sequences (pure and impure use the same order)

Highest to lowest:

1. A-K-Q
2. A-2-3
3. K-Q-J
4. Q-J-10
5. J-10-9
6. 10-9-8
7. 9-8-7
8. 8-7-6
9. 7-6-5
10. 6-5-4
11. 5-4-3
12. 4-3-2

### Within suite, pair and high card

- Suite and high card: compare the highest card, then the second, then the third.
  Example: K-9-4 beats K-8-7, because 9 is higher than 8.
- Pair: compare the rank of the pair first, then the third card.
  Example: 9-9-A beats 9-9-K.

## 4. Play

- There are 5 rounds. In round N, every player plays their Nth set.
- All three players reveal their set for the round at the same time.
- The strongest set wins the round.

### Playing order

- Play moves anticlockwise: the turn passes to the player on the right.
- Round 1: the player next to the dealer plays first, so the dealer plays last.
- Rounds 2 to 5: the player next to the winner of the previous round plays
  first, so that winner plays last.

### Exact ties

If the best sets in a round are exactly equal in strength (same type and same
ranks, differing only in suits), the player who played last among them wins.

Example: I play an impure 2-3-4 and a player after me also plays an impure
2-3-4. That player wins the round, not me.

## 5. Scoring

| Round | Points to the winner |
| ----- | -------------------- |
| 1     | 1                    |
| 2     | 2                    |
| 3     | 3                    |
| 4     | 4                    |
| 5     | 5                    |

- 15 points are available per game.
- The goal is the maximum number of points, not the maximum number of rounds won.

Because sets must be ordered strongest first, the strongest set competes for the
least valuable round and the weakest set competes for the most valuable one.
Rounds 4 and 5 together are worth 9 of the 15 points.

## 6. Optimiser requirement

Build an optimiser that tells a player how to arrange their hand for the maximum
points.

- Input: the player's 17 or 18 cards.
- Output:
  - which 2 or 3 cards to discard;
  - the best 5 sets, in descending order of strength.
- Objective: the highest expected total points, weighted 1 to 5 by round. It is
  not the number of rounds won.
- The optimiser must break strong sets when that pays. For example, if splitting
  a three of a kind gives more points in rounds 4 and 5, it should split it.
- Opponents are assumed to be smart: they also save strength for rounds 4 and 5.
- The opponents' cards are not visible. Since all 52 cards are dealt, the two
  opponents together hold exactly the cards the player does not hold. The
  arrangement is judged on its average result over the ways those cards could be
  split between the opponents.
- Interface: both a web page where the player types or taps their cards and a
  command-line tool. The answer must arrive in a fraction of a second.
- The same optimiser arranges the hands of the computer opponents in the game.

Two rules above give the optimiser extra information:

- Exact ties go to the last player, so the player's seat relative to the dealer
  matters and can be an optional input.
- The centre card is public, so everyone knows one card held by the player who
  picked it up.

## 7. Assumption

- Since all players reveal at the same time, the playing order matters only for
  breaking exact ties.
