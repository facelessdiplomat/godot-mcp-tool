# Skin the menu

**Request**

> Give the main menu one look: a Theme with dark buttons that have rounded corners and a larger font, used by the whole menu. Save the theme as res://ui/menu_theme.tres.

**Starting point**

A main menu (`res://menu.tscn`, the main scene): a full-screen `Control` with a background and three buttons, Play,
Options and Quit, in a `VBoxContainer`. No theme yet.

**Done when**

- `res://ui/menu_theme.tres` is a `Theme`, and the root control of the menu uses it.
- In the running game, the Play and the Quit button draw a `StyleBoxFlat` with rounded corners and a dark color, with
  a font larger than the default 16.

**Notes**

- A good run creates the theme with `resource_create` and its items by name, such as `"Button/styles/normal"` with
  `{"new": "StyleBoxFlat", …}` and `"Button/font_sizes/font_size"`, sets `theme` on the root control and checks a
  button in the running game. Overrides on each button are not one theme.
- Evaluation run: `server/test/evals/scenarios/skinTheMenu.ts`.
