# One more argument

**Request**

> Give take_damage of res://enemy.gd a second argument, source: String, the name of what dealt the damage, and have
> the enemy append it to a new array sources: Array[String]. Then make every caller pass its own name as the source:
> "sword" for the sword, "turret" for the turret, "poison" for the poison timer and "spikes" for the hurt animation,
> so that every hit on the goblin and on the barrel still lands and the game runs without errors.

**Starting point**

The arena with `Goblin`, a node with `res://enemy.gd` (`class_name Enemy`, 100 health) whose
`take_damage(amount: int)` counts the hits, and `Barrel`, a node with `res://barrel.gd` (`class_name Barrel`, 20
durability) that has a `take_damage(amount: int)` of its own. When the game starts, four callers hit the goblin once
each and two hit the barrel:

- `Sword` (`sword.gd`) calls `target.take_damage(1)` through a variable typed `Enemy`, then `barrel.take_damage(1)`
  through a variable typed `Barrel`;
- `Turret` (`turret.gd`) calls `victim.take_damage(2)` through an untyped variable, which the language server cannot
  trace;
- the `timeout` signal of the one-shot timer `Poison` is connected to `Goblin.take_damage` with the bound value 4,
  and that of the one-shot timer `Fuse` to `Barrel.take_damage` with the bound value 5;
- the `hurt` animation, played on start, calls `take_damage(3)` on `Goblin` from a method track.

**Done when**

- `enemy.gd` declares `take_damage(amount: int, source: String)`, `barrel.gd` keeps `take_damage(amount: int)`, and
  the scripts have no errors.
- In the running game every caller hits once: the enemy's `sources` hold "poison", "spikes", "sword" and "turret", and
  its health is 90; both hits on the barrel land, and its durability is 14.
- The game runs without errors.
- The agent found the callers with `script_find_references`.

**Notes**

- A search by text for `take_damage` finds two declarations and six uses, and two of the uses go to the barrel:
  `barrel.take_damage(1)` next to the sword's call of the goblin, and the connection of `Fuse` next to that of
  `Poison`. A second argument there breaks the barrel: the sword's script no longer compiles, and the connection
  calls with one argument too many when the game runs.
- `script_find_references` lists the typed call of the goblin, the connection of `Poison` with its bound value and
  the method track key. It names the `take_damage` of `barrel.gd`, with the call that goes to it, as left out, and
  the call on the untyped variable among the lines it could not trace.
- The first run with an agent, on 2026-11-19 and without the barrel, found the callers with one `Grep` and passed
  every check but the one of the tool. The barrel makes a text search answer more than the question asks. Writing
  this version found that the tool listed the barrel's call among the lines to check by hand; it now leaves out the
  uses that the language server traces to a symbol of the same name in another script.
- The rerun with the barrel, on the same day, went the same way: one `Grep`, then the agent read `barrel.gd` and
  `arena.tscn`, left the two uses of the barrel alone and passed every check but the one of the tool (8/9).
- With a line in the server instructions that sends this search to `script_find_references`, the third run called
  the tool, took its answer as the list of callers and passed every check (9/9, 26 calls).
- Writing this scenario found that a windowless editor kept a script changed on disk as it was while no tab of the
  script editor showed it, so `signal_connect` refused the second bound value; `editor_rescan` now reloads such
  scripts.
- Evaluation run: `server/test/evals/scenarios/oneMoreArgument.ts`.
