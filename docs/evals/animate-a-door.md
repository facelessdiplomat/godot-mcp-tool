# Animate a door

**Request**

> Make the door open when the game starts: it slides up 3 m in one second and stays open.

**Starting point**

A Godot project with the addon enabled and the editor running, and `res://level.tscn` with a `Door` (`CSGBox3D`,
2 × 3 m, standing on the floor at y = 1.5) and no `AnimationPlayer`.

**Done when**

- The level has an `AnimationPlayer` whose animation `open` lasts 1 s, does not loop and moves `Door:position` from
  Vector3(0, 1.5, 0) to Vector3(0, 4.5, 0); `animation_get` shows the track and its two keys.
- The player's `autoplay` is `open`, and the scene is saved.
- In the running game `game_wait` for `position.y > 4.4` on `Door` succeeds, and a minute later the door is still up.

**Notes**

- A good run adds the `AnimationPlayer` as a sibling of the door, so the track path is `Door:position`, and reads the
  result of `animation_set` instead of guessing whether the keys landed.
- It does not script a tween when the request asks for an animation the level designer can edit.
- Automated test: `server/test/integration/animation.test.ts`.
