# GDScript 4

## The shape of a script

```gdscript
class_name Enemy
extends CharacterBody3D

signal died

@export var speed := 3.0
@export var max_health := 3

@onready var mesh: MeshInstance3D = $Mesh

var health: int


func _ready() -> void:
	health = max_health


func take_damage(amount: int) -> void:
	health = maxi(health - amount, 0)
	if health == 0:
		died.emit()
		queue_free()
```

- `class_name` makes the script a global type that other scripts and the node tools can use by name; call
  `editor_rescan` after adding one.
- Exported values from a scene are set after the member initializers run, so copy them in `_ready()`, as with
  `health` above, rather than in an initializer.
- `@onready` values are set just before `_ready()`, when the children of the node exist; `$Mesh` is short for
  `get_node("Mesh")`, and `%Name` reaches a node marked as unique in its scene.

## Typing

- Inferred: `var speed := 5.0`. Declared: `var target: Node3D`. Return types: `func move() -> void:`.
- Typed collections: `var enemies: Array[Enemy] = []`, `var scores: Dictionary[String, int] = {}`.
- Casts and checks: `var body := node as CharacterBody3D` gives `null` when the type differs; `if node is Enemy:`.
- `5 / 2` is the integer 2, with a warning; write `5 / 2.0` or `float(a) / b` for a fraction.

## Signals, callables and waiting

- Declare `signal hit(damage: int)`, emit `hit.emit(2)`, connect `hit.connect(_on_hit)`.
- Bind extra arguments: `button.pressed.connect(_on_button_pressed.bind(index))`. Disconnect with
  `hit.disconnect(_on_hit)`.
- Lambdas: `var twice := func(value: int) -> int: return value * 2`, called with `twice.call(3)`.
- Wait with `await`: `await get_tree().create_timer(0.5).timeout`, `await get_tree().physics_frame`,
  `await died`. A function that awaits is a coroutine: callers that need its end must `await` it too.

## Everyday idioms

- Input: `Input.is_action_pressed("jump")`, `Input.is_action_just_pressed("jump")`,
  `Input.get_vector("move_left", "move_right", "move_forward", "move_back")`; one-off events in
  `_unhandled_input(event)`.
- Scenes: `const BULLET := preload("res://weapons/bullet.tscn")`, then `var bullet := BULLET.instantiate()` and
  `add_child(bullet)`. Change level with `get_tree().change_scene_to_file("res://levels/arena.tscn")`.
- Groups: `add_to_group("enemies")`, `get_tree().get_nodes_in_group("enemies")`,
  `get_tree().call_group("enemies", "alert")`.
- Tweens: `create_tween().tween_property(self, "position", target_position, 0.3)`.
- Calling the parent's version of a method: `super()` inside an override, `super.method()` elsewhere.
- Errors: `push_error("…")`, `push_warning("…")`, `assert(condition, "message")` (debug builds only).

A property runs code when it is set with a setter:

```gdscript
signal health_changed(health: int)

@export var max_health := 3

var health := 3:
	set(value):
		health = clampi(value, 0, max_health)
		health_changed.emit(health)
```

## Godot 3 code to avoid

Tutorials and memory often offer Godot 3 code. The left column fails in Godot 4 or is out of date; write the right
one.

| Godot 3 | Godot 4 |
|---|---|
| `export var`, `onready var`, `tool` | `@export var`, `@onready var`, `@tool` |
| `yield(get_tree().create_timer(1.0), "timeout")` | `await get_tree().create_timer(1.0).timeout` |
| `connect("pressed", self, "_on_pressed")` | `pressed.connect(_on_pressed)` |
| `emit_signal("died")` | `died.emit()` |
| `KinematicBody`, `move_and_slide(velocity, Vector3.UP)` | `CharacterBody3D`: set `velocity`, then `move_and_slide()` |
| `Spatial`, `translation` | `Node3D`, `position` |
| `instance()` | `instantiate()` |
| `get_tree().change_scene("…")` | `get_tree().change_scene_to_file("…")` |
| `rand_range(a, b)`, `deg2rad`, `rad2deg` | `randf_range(a, b)`, `deg_to_rad`, `rad_to_deg` |
| `OS.get_ticks_msec()` | `Time.get_ticks_msec()` |
| `PoolStringArray`, `PoolVector3Array` | `PackedStringArray`, `PackedVector3Array` |
| `.method()` to call the parent | `super.method()` |
| `var level setget set_level` | `var level: int: set = set_level`, or a `set(value):` block as above |
| `funcref(object, "method")` | `object.method` (a `Callable`) |
