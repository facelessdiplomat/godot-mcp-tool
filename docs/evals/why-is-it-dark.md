# Why is it dark

**Request**

> The second room of res://level.tscn is pitch black in the game, and the crate in it should be orange. Find out why the room is dark and fix it, so that the room is lit and the crate shows its orange color.

**Starting point**

A level (`res://level.tscn`, the main scene) of two closed rooms, `RoomA` and `RoomB`, under a night sky without
ambient light. The first room has a lamp (`OmniLight3D`) and a blue crate; the second has no light, and its crate has
a black material. The editor runs with a window, so the game has one too and `game_screenshot` works.

**Done when**

- A light shines inside the second room.
- In the running game an unshaded view of the second crate shows it orange, and a lit view of the room is not dark.

**Notes**

- Both problems give the same black picture, and a lit screenshot cannot tell them apart. A good run takes views of
  the room with `render: "unshaded"`, which shows the black material, and `render: "lighting"`, which shows that no
  light reaches the room; then adds a light and sets the albedo of the crate's material, such as with the path
  `"mesh:material:albedo_color"`.
- Evaluation run: `server/test/evals/scenarios/whyIsItDark.ts`.
