# Make an enemy follow the player

**Request**

> Bake navigation for the arena and make the enemy follow the player around the wall.

**Starting point**

A Godot project with the addon enabled and the editor running, and `res://arena.tscn`: a 20 × 20 m floor, a wall
10 m long between the two characters, a `Player` (`CharacterBody3D` at the south end) and an `Enemy`
(`CharacterBody3D` with a capsule at the north end, no script). No navigation yet.

**Done when**

- The arena has a `NavigationRegion3D` with a `NavigationMesh` whose source geometry is the floor and the wall, and
  `navigation_bake` reports polygons that cover the floor minus the agent radius.
- The enemy has a `NavigationAgent3D` and a script that moves it along the agent's path to the player.
- In the running game the enemy reaches the player: `game_wait` for its distance to the player to drop below
  1.6 m succeeds.
- The scene is saved.

**Notes**

- A good run puts the floor and the wall under the `NavigationRegion3D` (the `NavigationMesh` reads the region's
  children by default) or uses a group as the source, and reads the bake result before running the game.
- The script follows the agent's next path position on the floor plane and keeps gravity for the vertical velocity;
  walking straight at the player would stop at the wall.
- Automated test: `server/test/integration/navigationBake.test.ts`.
