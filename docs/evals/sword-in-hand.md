# Sword in hand

**Request**

> Put the sword res://props/sword.tscn into the character's hand in res://stage.tscn, so that it stays in the hand while the character waves its arm.

**Starting point**

A stage (`res://stage.tscn`, the main scene) with a character whose `Skeleton3D` has two bones, `Arm` and `Hand`,
and an `AnimationPlayer` that plays `wave` in a loop, turning the arm by 45 degrees up and down. The sword is a scene
of its own, `res://props/sword.tscn`. The character holds nothing.

**Done when**

- A `BoneAttachment3D` of the skeleton follows the bone `Hand`, and an instance of the sword is below it.
- In the running game the sword stays within 0.4 m of the hand bone and moves as the arm waves.

**Notes**

- A good run reads the bones in the inspector of the skeleton (`node_get_properties` of `Character/Skeleton`), adds
  the attachment and the sword in one `scene_batch_edit`, and checks the sword at two moments of the animation with
  read steps of `game_input`.
- Evaluation run: `server/test/evals/scenarios/swordInHand.ts`.
