# Chapka

Chapka is a 3-player card game of five sets. This project has two parts:

- **The optimiser.** Give it your 17 or 18 cards and it returns the cards to
  discard and your five sets, in playing order, with the highest expected points.
- **The game.** A desktop browser game where you play against two computer
  opponents that arrange their hands with the same optimiser.

The rules are in [docs/GAME_SPEC.md](docs/GAME_SPEC.md).

## Run it

```sh
npm install
npm run dev
```

Then open http://localhost:5183. The game is designed for a laptop or desktop
window of 1280 x 720 or larger.

## Publish it

The game is a static site and is set up for Cloudflare's free plan.

```sh
npx wrangler login    # once; opens your browser to sign in to Cloudflare
npm run deploy        # builds the game and publishes it
```

The command prints the public address, in the form
`https://chapka.<your-subdomain>.workers.dev`. Run `npm run deploy` again to
publish a newer version. The site name comes from `name` in `wrangler.jsonc`.

## Use the optimiser at a real table

### In the browser

Open **Optimiser** from the top bar, or **Optimise a hand** on the title screen.

- Type your cards and press Enter, for example `AS KH 10D 7C`, or tap them in
  the grid. Ranks are `A K Q J 10 9 ... 2` (`T` also works for 10) and suits are
  `S H D C`.
- The answer appears as soon as the 17th card is in. Add an 18th if you picked
  up the centre card.
- The dealer and the centre card are optional details. They only refine the
  answer slightly.

### On the command line

```sh
npm run optimise                 # asks for your cards, hand after hand
npm run optimise -- AS AH AD KS KH 9S 9D 8C 7C 6H 5H 4H 3D 2D JC 10S QD
npm run optimise -- --help       # all options
```

Example output:

```text
Hand (17 cards): A♠ A♥ A♦ K♠ K♥ Q♦ J♣ 10♠ 9♠ 9♦ 8♣ 7♣ 6♥ 5♥ 4♥ 3♦ 2♦
Discard: A♥ K♥

Round 1 (1 pt ) A♦ 2♦ 3♦     Pure Sequence, A-2-3             win  19%
Round 2 (2 pts) 6♥ 5♥ 4♥     Pure Sequence, 6-5-4             win  30%
Round 3 (3 pts) A♠ K♠ Q♦     Impure Sequence, A-K-Q           win  58%
Round 4 (4 pts) J♣ 10♠ 9♦    Impure Sequence, J-10-9          win  62%
Round 5 (5 pts) 9♠ 8♣ 7♣     Impure Sequence, 9-8-7           win  90%

Expected points: 9.53 of 15
```

This hand holds three aces. The optimiser splits them across two sequences and
discards the third, because five sequences are worth more in total than keeping
the aces together.

`--fast` skips the simulation and answers in about 10 ms. The default simulates
400 deals and takes about a second.

## Use the optimiser in the game

- **Optimise my hand** (while discarding) picks the discards and arranges all
  five sets in one step.
- **Suggest discards** only marks the discards and leaves the arranging to you.
- **Auto arrange** (while arranging) rearranges the 15 cards you kept.

You can still move cards yourself by dragging one onto another, or by tapping
two cards to swap them. Sets that are not in descending strength cannot be
locked.

## How the optimiser works

Your expected points are the sum, over the five rounds, of the round's points
times your chance of winning that round. That chance depends only on how strong
your set is and on what the two opponents tend to play in that round.

1. **What opponents play.** A table gives the chance that a set of each
   strength wins each round against two skilled opponents. It was produced by
   self-play: all three players arrange 5,000 deals against the current table,
   the table is updated from what they played, and this repeats 14 times, by
   which point it has settled (`npm run train`).
2. **Exact search.** For your hand, the optimiser searches every choice of
   discards and every split of the remaining 15 cards into five sets, with the
   sets forced into descending order. It returns the split with the highest
   expected points under the table. This is exact, not a heuristic, and takes a
   few milliseconds.
3. **Simulation.** It then deals the cards you cannot see to two opponents 400
   times, lets each arrange their hand, and recomputes your win chances for your
   own cards. This mainly sharpens the win percentages shown.

### Measured strength

`npm run evaluate` plays seat 0 three ways on the same deals against two
opponents who use the optimiser. With three equal players the average is 5
points a game. Over 800 deals:

| How seat 0 arranges its hand         | Points per game |
| ------------------------------------ | --------------- |
| Strongest possible sets first        | 4.10 ± 0.14     |
| Optimiser, instant answer            | 4.96 ± 0.15     |
| Optimiser with a 240-deal simulation | 4.96 ± 0.15     |

The simulation step did not change the score on these deals (difference
0.000 ± 0.023), so the instant answer is as good in play.

### Limits

- "Highest expected points" is against opponents who arrange well. Real
  opponents who play differently change the true win chances.
- The cards an opponent holds are unknown, so any single game can still go
  badly with the best arrangement.

## Computer opponents

- **Kabir, the Strategist,** runs the optimiser as it is.
- **Zoya, the Maverick,** runs the same optimiser but values the rounds
  differently each game, sometimes favouring round 5 and sometimes the early
  rounds, so her arrangements are harder to predict.

Neither sees any card they would not see at a real table.

## Scripts

| Command            | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `npm run dev`      | Starts the game at http://localhost:5183            |
| `npm run build`    | Type-checks and builds the game into `dist/`        |
| `npm run preview`  | Serves the built game                               |
| `npm run deploy`   | Builds and publishes the game to Cloudflare         |
| `npm test`         | Runs the rules and optimiser tests                  |
| `npm run optimise` | Command-line optimiser                              |
| `npm run evaluate` | Measures the optimiser in simulated games           |
| `npm run train`    | Regenerates the self-play table (about 15 minutes)  |

## Layout

| Path          | Contents                                                        |
| ------------- | --------------------------------------------------------------- |
| `src/engine/` | Rules, set ranking, optimiser and opponent model. No UI code.   |
| `src/game/`   | Game state and the timeline of a game                           |
| `src/ui/`     | Table, cards, seats, set trays, Optimiser screen and overlays   |
| `src/worker/` | Runs the simulation on background threads in the browser        |
| `src/cli/`    | Command-line optimiser, evaluation and training                 |
| `src/audio/`  | Synthesised sound effects                                       |
