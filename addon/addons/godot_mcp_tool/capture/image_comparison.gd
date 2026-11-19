extends RefCounted

const OUTLINE_COLOR := Color(1, 0, 1)
const OUTLINE_WIDTH := 2
const REDUCED_LONGEST_SIDE := 256
const IMAGE_EXTENSIONS := ["png", "jpg", "jpeg", "webp"]
const RESOURCE_PREFIX := "res://"


static func load_earlier(reference: String) -> Variant:
	var project_folder := ProjectSettings.globalize_path(RESOURCE_PREFIX)
	var file_path := ProjectSettings.globalize_path(reference) if reference.begins_with(RESOURCE_PREFIX) else reference
	if not file_path.simplify_path().begins_with(project_folder.simplify_path()):
		return "%s is not inside the project; compare with the path of an earlier screenshot or with an image of the project, such as res://screenshots/level.png" % reference
	if not file_path.get_extension().to_lower() in IMAGE_EXTENSIONS:
		return "%s is not an image file (%s)" % [reference, ", ".join(PackedStringArray(IMAGE_EXTENSIONS))]
	if not FileAccess.file_exists(file_path):
		return "%s does not exist; the last 100 screenshots are kept, so an older one may be gone" % reference
	var image := Image.load_from_file(file_path)
	if image == null or image.is_empty():
		return "%s could not be read as an image" % reference
	return image


static func compare(current: Image, earlier: Image, tolerance: float) -> Dictionary:
	var sizes_match := current.get_size() == earlier.get_size()
	var current_rgb := _rgb_copy(current)
	var earlier_rgb := _rgb_copy(earlier)
	if not sizes_match:
		earlier_rgb.resize(current.get_width(), current.get_height(), Image.INTERPOLATE_BILINEAR)
	var metrics := current_rgb.compute_image_metrics(earlier_rgb, false)
	var changes := _changes(current_rgb, earlier_rgb, tolerance)
	return {
		"sizes_match": sizes_match,
		"earlier_size": [earlier.get_width(), earlier.get_height()],
		"mean_difference": float(metrics.get("mean", 0.0)),
		"changed_share": changes["share"],
		"changed_rect": changes["rect"],
		"tolerance": tolerance,
	}


static func outline(image: Image, rect: Array) -> void:
	var area := Rect2i(int(rect[0]), int(rect[1]), int(rect[2]), int(rect[3])).grow(OUTLINE_WIDTH).intersection(Rect2i(Vector2i.ZERO, image.get_size()))
	image.fill_rect(Rect2i(area.position, Vector2i(area.size.x, OUTLINE_WIDTH)), OUTLINE_COLOR)
	image.fill_rect(Rect2i(area.position.x, area.end.y - OUTLINE_WIDTH, area.size.x, OUTLINE_WIDTH), OUTLINE_COLOR)
	image.fill_rect(Rect2i(area.position, Vector2i(OUTLINE_WIDTH, area.size.y)), OUTLINE_COLOR)
	image.fill_rect(Rect2i(area.end.x - OUTLINE_WIDTH, area.position.y, OUTLINE_WIDTH, area.size.y), OUTLINE_COLOR)


static func _rgb_copy(image: Image) -> Image:
	var copy := image.duplicate() as Image
	if copy.is_compressed():
		copy.decompress()
	copy.convert(Image.FORMAT_RGB8)
	return copy


static func _changes(current: Image, earlier: Image, tolerance: float) -> Dictionary:
	var scale := minf(1.0, float(REDUCED_LONGEST_SIDE) / maxi(current.get_width(), current.get_height()))
	var reduced_size := Vector2i(maxi(1, roundi(current.get_width() * scale)), maxi(1, roundi(current.get_height() * scale)))
	var small_current := current.duplicate() as Image
	var small_earlier := earlier.duplicate() as Image
	small_current.resize(reduced_size.x, reduced_size.y, Image.INTERPOLATE_BILINEAR)
	small_earlier.resize(reduced_size.x, reduced_size.y, Image.INTERPOLATE_BILINEAR)
	var changed := 0
	var lowest := reduced_size
	var highest := Vector2i(-1, -1)
	for y in reduced_size.y:
		for x in reduced_size.x:
			var a := small_current.get_pixel(x, y)
			var b := small_earlier.get_pixel(x, y)
			if maxf(absf(a.r - b.r), maxf(absf(a.g - b.g), absf(a.b - b.b))) > tolerance:
				changed += 1
				lowest = Vector2i(mini(lowest.x, x), mini(lowest.y, y))
				highest = Vector2i(maxi(highest.x, x), maxi(highest.y, y))
	if changed == 0:
		return {"share": 0.0, "rect": null}
	var factor := Vector2(current.get_size()) / Vector2(reduced_size)
	var position := Vector2i((Vector2(lowest) * factor).floor())
	var end := Vector2i((Vector2(highest + Vector2i.ONE) * factor).ceil()).min(current.get_size())
	return {"share": float(changed) / (reduced_size.x * reduced_size.y), "rect": [position.x, position.y, end.x - position.x, end.y - position.y]}
