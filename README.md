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

## Leaderboard

There is no server behind this — it's static files on a static host — so there is nowhere for players' scores to meet. Rather than bolt on a backend and an account system, results travel the way results already travel: inside the share text.

Set a name, and your share text gains a code line:

```
HDL209.W.1.2.11.AJ.7
```

Send it to the group; anyone pastes the whole message into their leaderboard and it lands. Each player's board is their own copy, assembled from what they've been sent, ranked per-puzzle and all-time.

Ranking is survivors first, then least damage (body + rope — the tracks cost differently to fill, but a notch of either is one mistake), then fewest guesses.

The checksum catches a mangled paste — a truncated message, a stray character from a chat client. **It is not anti-cheat.** Anyone who reads `src/score.js` can mint a code claiming a perfect game. For a group of friends that's the right trade: no accounts, no backend, nothing to sign up for, and the link still works for anyone you send it to.

### Connecting Supabase

Fill in a project and the paste step disappears: results post to a shared table and everyone sees the same board. Three steps.

1. Run `supabase/setup.sql` in the Supabase SQL editor. It creates the `hangdle_scores` table, a unique index on (puzzle, name), and row-level security policies.
2. Copy your project URL and **anon** key from Project Settings → API.
3. Paste them into `src/config.js` and push.

Both values are safe to commit. The anon key is public by design — it ships inside a page anyone can view — so the policies are what matter, and they allow exactly two things: insert a score, read scores. No updates, no deletes, no access to anything else. **Never put the `service_role` key in `config.js`**; that one bypasses every policy.

Constraints in the SQL reject malformed rows (name pattern, sane ranges), and the unique index means your first result for a puzzle is the one that stands — replaying can't improve your score. A repeat submission comes back as `409`, which the client reads as "already recorded" rather than an error.

This still isn't anti-cheat: anyone can post a perfect score under any name. It removes the paste step, which is the point. Deleting a bogus entry is a one-line `delete` in the SQL editor.

Leave `config.js` empty and everything falls back to pasted codes. If the project is unreachable the game says so and keeps playing from local results — the leaderboard never blocks a game.

Note that the offline-capable single-file bundle can't reach Supabase when it's hosted somewhere with a strict content-security policy; the deployed site is where the shared board works.

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

## Home screen

Saved to a phone's home screen, the app gets the gallows as its icon and opens
without browser chrome.

`icons/icon.svg` is the source; `node scripts/icons.js` renders the PNGs, which
are committed so deploying never needs a browser installed. The icon is drawn
separately from the in-game gallows rather than reused — at 60px the figure is
mud, so it's the silhouette and the noose at much heavier stroke weights, kept
inside a centred circle so Android can mask it to any shape.

Two things to preserve if you touch this:

- Every icon and manifest path is **relative**. The site is served from a
  `/hangman/` subpath, so a leading slash sends every request to the domain root.
- iOS ignores an SVG `apple-touch-icon`, and ignores a `data:` URI for one. It
  wants a real PNG at a real path, which is why `apple-touch-icon.png` exists
  alongside the SVG favicon.

The status bar is translucent in standalone mode, so `.topbar` adds
`env(safe-area-inset-top)` to its padding — without it the clock lands on the
wordmark.

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
scripts/icons.js    renders icons/*.png from icons/icon.svg
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
