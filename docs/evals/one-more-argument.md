# One more argument

**Request**

> Give take_damage of res://enemy.gd a second argument, source: String, the name of what dealt the damage, and have
> the enemy append it to a new array sources: Array[String]. Then make every caller pass its own name as the source:
> "sword" for the sword, "turret" for the turret, "poison" for the poison timer and "spikes" for the hurt animation,
> so that every hit still lands and the game runs without errors.

**Starting point**

The arena with `Goblin`, a node with `res://enemy.gd` (`class_name Enemy`, 100 health) whose
`take_damage(amount: int)` counts the hits, and four callers that hit it once each when the game starts:

- `Sword` (`sword.gd`) calls `target.take_damage(1)` through a variable typed `Enemy`;
- `Turret` (`turret.gd`) calls `victim.take_damage(2)` through an untyped variable, which the language server cannot
  trace;
- the `timeout` signal of the one-shot timer `Poison` is connected to `Goblin.take_damage` with the bound value 4;
- the `hurt` animation, played on start, calls `take_damage(3)` on `Goblin` from a method track.

**Done when**

- `enemy.gd` declares `take_damage(amount: int, source: String)`, and the scripts have no errors.
- In the running game every caller hits once: the enemy's `sources` hold "poison", "spikes", "sword" and "turret", and
  its health is 90.
- The game runs without errors.
- The agent found the callers with `script_find_references`.

**Notes**

- `script_find_references` lists the typed call, the signal connection with its bound value and the method track key,
  and names the call on the untyped variable among the lines it could not trace. A search by text finds the scripts
  but easily misses the scene; a change of the script alone leaves the connection and the track calling with one
  argument, which fails only when the game runs.
- Writing this scenario found that a windowless editor kept a script changed on disk as it was while no tab of the
  script editor showed it, so `signal_connect` refused the second bound value; `editor_rescan` now reloads such
  scripts.
- Evaluation run: `server/test/evals/scenarios/oneMoreArgument.ts`.
