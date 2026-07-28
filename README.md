# Gallows

Hangman crossed with Wordle. You don't just guess the letter — you guess **which slot it sits in**.

Play: `npm start`, then open http://localhost:8080. No build step, no dependencies, no backend.

## The rules

Every guess is a pair: a letter and a slot.

| | | |
|---|---|---|
| **Hit** | The letter is in that slot | Locks in. Costs nothing. |
| **Near** | The letter is in the word, but not there | The rope tightens. |
| **Miss** | The letter isn't in the word | A body part goes up. |

Two tracks can kill you, and they fill independently: **six body parts** or **five rope notches**. A run of near misses is just as fatal as a run of wrong letters.

That price on a near miss is what keeps the game honest. If probing were free, the dominant strategy would be to fire every common letter at slot 1 to test membership at no cost — which is Wordle with extra clicks. Charging for a near makes probing a real tactic with a real cost.

### Why the rope is shorter

Equal track lengths are not equal pressure. Near misses accrue more slowly than outright misses, so at 6/6 the rope almost never decides anything — simulating every word in the pools put just **14%** of deaths on it. Five splits deaths 43/57 between rope and body while keeping a strong bot near a 90% win rate:

| body / rope | bot win rate | rope's share of deaths |
|---|---|---|
| 6 / 6 | 93% | 14% |
| **6 / 5** | **90%** | **43%** |
| 5 / 4 | 71% | 45% |

Four balances just as well but costs too much difficulty. Note that the bot has perfect recall of every word still consistent with the feedback and calls the answer the moment one candidate remains — read its win rate as a ceiling, not a forecast for humans.

Both limits live at the top of `src/engine.js`, and `createGame` takes per-game overrides. Re-measure with `node scripts/simulate.js --grid` if the word pools change materially.

### No counting

Landing a letter tells you nothing about how many more of it there are. Hit the `O` in slot 3 of `SPOON` and the second `O` is still out there, unmarked. Nothing in the game ever reveals a count, so you win by filling every slot — never by inference alone.

One consequence is worth stating plainly, because it looks like a bug until you see why it isn't: **once every copy of a letter is on the board, guessing that letter again is a miss, not a near.** The alternatives are both worse. Calling it a near would send you hunting for a `P` that cannot be found. Rejecting the guess for free would announce the `P` count outright — exactly the information the no-counting rule exists to withhold. A miss is true, and it costs what any other dead end costs.

### Calling the word

Think you have it? Call the whole word. Right wins on the spot; wrong costs **two body parts**. Without it the endgame turns clerical — you've deduced the answer but still have to place four more letters one at a time.

## Reading the board

Knowledge splits into two kinds, and the board shows both:

- **Global** — the keyboard tracks each letter's overall state: untried, in the word, placed, or dead.
- **Per slot** — each slot remembers what you've ruled out *for that slot*. Select a slot to see its eliminations.

Wordle only needs the first kind, which is why one keyboard row carries all of its state. Here a letter can be alive in general and impossible in three specific places at once, so the per-slot strip does the work you'd otherwise be doing on paper.

## Input

Pick a slot, pick a letter, press **Enter** to commit. The two-step commit is deliberate: every guess costs something, so a stray keypress must never fire one off.

Arrow keys move between empty slots, Backspace clears the pending letter, and clicking a slot selects it.

## Daily puzzle

One word a day, the same for everyone, derived from the local date — so it flips at your midnight, not UTC's. Length ramps through the week: five letters early, seven by the weekend.

An in-progress daily survives a refresh. Practice mode gives unlimited random words and doesn't touch your stats.

Results share as an emoji grid that wraps at the word length, so it comes out the same shape as the puzzle. A square's position says nothing about which slot was guessed, so it spoils nothing.

## Layout

```
index.html          markup, and the gallows SVG
styles.css
src/engine.js       game rules — pure, no DOM
src/words.js        answer pools by length
src/daily.js        date → word, deterministic
src/storage.js      localStorage: saved game + stats
src/share.js        result grid and clipboard
src/main.js         UI controller
test/               node --test
scripts/serve.js    static server for local play
scripts/check-words.js
```

The engine is pure and DOM-free, so the rules are testable on their own and portable if this ever wants a native front end.

## Development

```sh
npm test          # engine + daily-puzzle tests
npm run words     # validate the answer pools
npm run words:fix # drop bad entries, dedupe, sort
npm start         # serve on :8080

node scripts/simulate.js --grid            # balance sweep over both tracks
node scripts/simulate.js --body 6 --rope 5 # measure one setting
```

Deploying is a file copy — any static host works, GitHub Pages included.
