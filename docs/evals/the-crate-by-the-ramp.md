# The crate by the ramp

**Request**

> One of the crates in res://arena.tscn stands at the foot of the ramp. Paint that crate red and leave the other
> crates as they are.

**Starting point**

An arena with a stone floor, a ramp that rises toward -Z, and eight wooden crates, `Crates/Crate1` to
`Crates/Crate8`, that share one mesh and one material. `Crate5` stands in front of the low end of the ramp, `Crate2`
behind its high end, and the others stand around the arena. No name says which crate is where.

**Done when**

- In the running game `Crate5` is red.
- The seven other crates keep their wood color.

**Notes**

- The crate is named by where it stands, not by its node. The agent can find it in numbers, from the positions or
  the bounds of the ramp and of the crates, or in pictures from several views.
- The crates share their material, so a change of the material paints all of them; `material_override` of one crate,
  as in `paint-one-enemy`, paints only that one.
- The scenario was written for `markers` of a view, a hypothesis of task T12 that numbered the nodes in a picture. The
  run with an agent on 2026-11-19 used no markers: one `node_get_properties` with `paths` read the positions of the
  ramp and of the crates, and the agent painted `Crate5` in 5 calls. By the rule of T12 the option was removed.
- Evaluation run: `server/test/evals/scenarios/theCrateByTheRamp.ts`.
