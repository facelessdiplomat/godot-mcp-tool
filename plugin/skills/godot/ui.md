# User interface

Menus, HUDs and other `Control` nodes, and how to check them with the godot tools.

## Layout

- Containers first: `VBoxContainer` and `HBoxContainer` stack their children, `GridContainer` puts them in columns,
  `MarginContainer` adds space around one child, `CenterContainer` centers it. Children of a container are placed by
  it; set their `size_flags_horizontal` and `size_flags_vertical` (`"Fill"`, `"Expand"`, `"Shrink Center"`) and
  `custom_minimum_size` instead of their position.
- Anchors place a control that no container holds. With the node tools, give `anchors_preset` by name, such as
  `"Full Rect"`, `"Center"` or `"Bottom Left"`, as the Anchor Preset of the inspector does; it also switches the
  control to anchors layout. For exact edges, set `anchor_left`, `anchor_top`, `anchor_right`, `anchor_bottom` (0 to
  1 of the parent) together with `offset_left` and the other offsets in pixels from those anchors, such as a health
  bar 40 px above the bottom: `{"anchor_top": 1, "anchor_bottom": 1, "offset_top": -70, "offset_bottom": -40}`.
- A HUD belongs on a `CanvasLayer`, so that it draws over the 3D view and does not move with the camera; a higher
  `layer` draws on top.
- The window: `display/window/stretch/mode` `"canvas_items"` with `aspect` `"expand"` scales the UI with the window
  and keeps anchored controls at their edges; `project_create` sets both.

## Themes

- One `Theme` on the root control styles every control below it. Create it with `resource_create` and its items by
  name, `"Type/kind/name"`: `"Button/styles/normal"` with `{"new": "StyleBoxFlat", "bg_color": "#20232a",
  "corner_radius_top_left": 8, …}`, `"Button/font_sizes/font_size"`, `"Button/colors/font_color"`,
  `"Label/constants/outline_size"`. Then set `theme` on the root control to its path.
- A single control that must differ takes an override, such as `theme_override_colors/font_color`.

## Focus, gamepads and pausing

- A menu that a gamepad or the keyboard can use needs focus: give the first button focus when the menu shows with
  `grab_focus()`, and the arrows and `ui_accept` move and press from there. `focus_mode` `"None"` keeps a control out
  of it.
- A pause menu pauses the tree and keeps running itself: `get_tree().paused = true`, and `process_mode` `"Always"` on
  the menu, or `"When Paused"`.

```gdscript
extends CanvasLayer

@onready var resume_button: Button = $Buttons/Resume


func _ready() -> void:
	visible = false
	resume_button.pressed.connect(_resume)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		if get_tree().paused:
			_resume()
		else:
			get_tree().paused = true
			visible = true
			resume_button.grab_focus()


func _resume() -> void:
	get_tree().paused = false
	visible = false
```

## Checking a UI

- `editor_screenshot` of a UI scene with `sizes`, such as `[[1920, 1080], [1280, 1024]]`, renders it at several
  window sizes side by side, laid out with the stretch settings of the project.
- `node_get_bounds` of a control gives its rectangle in canvas pixels and whether it fits the window of the project.
- In the running game, `game_get_tree` with `controls: true` lists the visible controls with their rectangles, texts
  and states, and `game_input` clicks one by its path, such as `{"click": "PauseMenu/Buttons/Resume"}`; read the
  result with `game_get_properties`.
