# Hangdle

Hangman crossed with Wordle. You don't just guess the letter — you guess **which slot it sits in**.

Hangman plus Wordle, in the name as well as the rules.

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

Equal track lengths are not equal pressure. Near misses accrue more slowly than outright misses, so at 6/6 the rope almost never decides anything.

`scripts/simulate.js` plays every word in the pools with two players. The **candidate bot** keeps every word still consistent with the feedback and calls the answer the moment one remains — a ceiling no person reaches. The **human model** tracks only what a person plausibly holds in their head (dead letters, per-slot eliminations, which letters like which positions) and calls the word when the visible pattern admits only one — a floor. Real players sit between them.

| body / rope | bot win | rope's share | human win | rope's share |
|---|---|---|---|---|
| 6 / 6 | 93% | 14% | 39% | 22% |
| **6 / 5** | **90%** | **43%** | **33%** | **32%** |
| 6 / 4 | 81% | 70% | 27% | 46% |
| 5 / 4 | 71% | 45% | 19% | 39% |

Five is the only length that keeps the rope responsible for roughly a third to a half of deaths under *both* models. Six makes it decoration for a strong player. Four makes it dominant for a strong player and merely balanced for a weak one, while pushing the win rate toward a coin flip.

Both limits live at the top of `src/engine.js`, and `createGame` takes per-game overrides. Re-measure with `node scripts/simulate.js --compare` if the word pools change materially.

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

An in-progress daily survives a refresh. Practice gives unlimited random words and never touches your stats.

## Modes

The daily is always Normal, so everyone plays the same puzzle under the same rules. **New game** picks a word length (any, 5, 6 or 7) and a mode:

| | |
|---|---|
| **Normal** | Six body parts, five rope notches — the daily setting. |
| **Hard** | Six body parts, four rope notches. Near misses bite sooner and the rope does most of the killing (measured: a strong bot drops from 90% to 81%). |
| **Zen** | No limits at all. Nothing can kill you, so you can work the placement mechanic out without dying to it. |

Zen hides both meters and never draws the figure — a completed gallows that couldn't kill you would be a lie. Your last choice is remembered.

A finished game always offers the way forward: **See result** reopens the summary, **New game** starts another, and **Today's puzzle** returns to the daily from anywhere.

Results share as an emoji grid that wraps at the word length, so it comes out the same shape as the puzzle. A square's position says nothing about which slot was guessed, so it spoils nothing.

## Look

Cool ink base, warm lamplight falling across it. The contrast between a cold
shadow and a warm light source is what makes the scene read as lit rather than
drawn — a flat brown-on-brown palette reads as clip-art no matter how good the
geometry is.

The figure draws itself on via `stroke-dashoffset` rather than popping into
place, and the noose gains slanted wraps stacked upward from the neck. Two
notes for anyone editing the SVG:

- The gradients use `gradientUnits="userSpaceOnUse"`. A bbox-relative gradient
  renders *nothing* on a perfectly vertical or horizontal line, because the
  bounding box has zero width or height — which silently erased the post, the
  beam and the rope the first time round.
- Wraps are slanted and close-set on purpose. A single flat wrap centred on the
  rope just reads as a crossbar.

Letter states on the keyboard differ by treatment, not only hue — solid fill for
placed, outline plus a dot for in-the-word, struck through for dead. Green
against amber alone fails for a good share of players.

### Light theme

Daylight, not an inverted night. The dark theme is a lamplit scene — cold
shadow, warm light, a pale figure glowing against it. Flipping those values
gives a washed-out grey page with a white stick figure on it, so the light
theme is built from a different idea: ink on warm paper, the gallows drawn
rather than lit, the figure the *darkest* thing on the page instead of the
brightest. The accents darken sharply (a mint green that sings on near-black is
illegible on paper), the deep tints and accents swap roles, the grain blends
with `multiply` instead of `overlay` because overlay lightens on a light ground,
and the lamp glow all but disappears.

Every themeable colour is a custom property on `:root`, restated under
`:root[data-theme="light"]`. Anything hardcoded in a rule survives the switch
and looks wrong in one theme — that's why the gradients, rings, glows and
strike-through colours are all tokens.

An inline script in `<head>` sets `data-theme` before first paint, so the page
never flashes the wrong theme. An explicit choice is stored and wins; otherwise
it follows the system and keeps following it as the system changes.

Both themes are checked against a 4.5:1 contrast floor. Worth knowing if you
audit it yourself: a naive check reads `backgroundColor`, which is `transparent`
on anything using a gradient — that reports the placed keys against the page
behind them and is wildly wrong in both directions.

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
scripts/simulate.js     balance simulator (candidate bot + human model)
```

The engine is pure and DOM-free, so the rules are testable on their own and portable if this ever wants a native front end.

## Development

```sh
npm test          # engine + daily-puzzle tests
npm run words     # validate the answer pools
npm run words:fix # drop bad entries, dedupe, sort
npm start         # serve on :8080

node scripts/simulate.js --compare         # bot vs human model at each setting
node scripts/simulate.js --grid            # balance sweep over both tracks
node scripts/simulate.js --body 6 --rope 5 # measure one setting
```

Deploying is a file copy — any static host works, GitHub Pages included.
