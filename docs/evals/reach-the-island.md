# Reach the island

**Request**

> The enemy chases the player on the mainland, but never follows the player across the bridge to the island. Find out why and fix it, so that the enemy reaches the player on the island.

**Starting point**

A level (`res://arena.tscn`, the main scene) with two `NavigationRegion3D`, `Mainland` and `Island`, each with its
floor and a baked navigation mesh, and a `Bridge` between the floors that belongs to no region. The player stands on
the island; the enemy, a `CharacterBody3D` with a `NavigationAgent3D` and `enemy.gd`, starts on the mainland.

**Done when**

- The scripts have no errors.
- `navigation_get_path` from the enemy's start to the island reaches the target.
- In the running game the enemy comes within 1.6 m of the player on the island.

**Notes**

- A good run asks `navigation_get_path` first, which says that the path stops at the edge of the mainland, sees that
  the bridge has no navigation mesh, puts the floors under one region (or joins the regions with a
  `NavigationLink3D` and bakes the bridge), bakes, and asks again before running the chase once.
- Evaluation run: `server/test/evals/scenarios/reachTheIsland.ts`.
