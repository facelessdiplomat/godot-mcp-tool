# Silence in the arena

**Request**

> The arena should have background music on its Music bus, but nothing can be heard. Find out why and fix it.

**Starting point**

The arena with a `Music` player (`AudioStreamPlayer`) whose stream is `res://music.wav` and whose bus is `Music`. Two
things keep it silent: the `Music` bus of the bus layout is muted, and the player never starts (no `autoplay`, and no
script calls `play()`).

**Done when**

- In the running game the `Music` player plays on the `Music` bus.
- The `Music` bus and `Master` both carry sound (`audio_buses_get` with `in_game` reads a peak above -60 dB).

**Notes**

- A good run listens first with `audio_buses_get` and `in_game`, which shows that no player plays and that the bus is
  muted, unmutes the bus with `audio_buses_set`, turns on `autoplay` with `node_set_properties` (or calls `play()`),
  and listens again.
- Evaluation run: `server/test/evals/scenarios/silenceInTheArena.ts`.
