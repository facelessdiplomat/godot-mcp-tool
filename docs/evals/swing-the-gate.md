# Swing the gate

**Request**

> Hang the gate in the gap of the north wall on a hinge at its post, so that the player can push it open by walking into it. The gate must stay on its post, and it must stay closed until it is pushed.

**Starting point**

The arena with a walking player, a 2 m gap in the north wall, a `Post` (`StaticBody3D`) on the west side of the gap
and a `Gate` (`RigidBody3D`, 10 kg) standing in it. Nothing holds the gate, and the player script moves the player
without pushing anything.

**Done when**

- The scripts have no errors, and a `HingeJoint3D` joins the post and the gate.
- In the running game the gate stays closed until it is pushed; the player walking into it from the south turns it by
  more than 20 degrees, and its edge stays at the post.

**Notes**

- A good run reads `docs_class HingeJoint3D` to learn that the hinge turns around the joint's own Z axis, so a
  vertical hinge needs `rotation_degrees` `[-90, 0, 0]` or the like; sets `node_a` and `node_b`; and lets the player
  push rigid bodies, since a `CharacterBody3D` does not push them by itself: an impulse to the collider of each slide
  collision. It checks the gate in the running game with `game_input` and `game_get_properties`.
- Evaluation run: `server/test/evals/scenarios/swingTheGate.ts`.
