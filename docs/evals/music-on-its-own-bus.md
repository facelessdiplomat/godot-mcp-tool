# Music on its own bus

**Request**

> Add a Music bus and an Effects bus to the project's audio bus layout, both sending to Master, with Music 6 dB quieter than Effects, and play the music on Music and the jump sound on Effects.

**Starting point**

The arena with a walking, jumping player as the main scene, an `AudioStreamPlayer` named `Music` that plays at once,
and an `AudioStreamPlayer3D` named `JumpSound` under the player. The project has no bus layout of its own.

**Done when**

- The bus layout of the project (`res://default_bus_layout.tres`, or the file that `audio/buses/default_bus_layout`
  names) has a `Music` bus and an `Effects` bus that send to `Master`.
- The `Music` bus is 6 dB quieter than the `Effects` bus.
- In the running game `Music` plays on the `Music` bus and `Player/JumpSound` on the `Effects` bus; a player whose
  bus does not exist falls back to `Master`.

**Notes**

- `audio_buses_set` adds the buses and saves the layout, an `AudioBusLayout` resource with the properties
  `bus/<index>/name`, `volume_db` and `send`; then `node_set_properties` puts each player on its bus, which the editor
  allows only for a bus of its layout.
- Buses added by a script at run time are not in the layout, so they fail the first two checks.
- Evaluation run: `server/test/evals/scenarios/musicOnItsOwnBus.ts`.
