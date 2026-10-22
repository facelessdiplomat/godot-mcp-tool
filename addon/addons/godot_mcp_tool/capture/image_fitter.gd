extends RefCounted

const SHEET_BACKGROUND := Color(0.12, 0.12, 0.12)


static func fit(image: Image, max_size: int) -> Image:
	return resized(image, fitted_size(image.get_size(), max_size))


static func resized(image: Image, size: Vector2i) -> Image:
	if image.get_size() == size or size.x <= 0 or size.y <= 0:
		return image
	var copy := image.duplicate() as Image
	copy.resize(size.x, size.y, Image.INTERPOLATE_LANCZOS)
	return copy


static func fitted_size(size: Vector2i, max_size: int) -> Vector2i:
	var longest_side := maxi(size.x, size.y)
	if longest_side <= max_size:
		return size
	var scale := float(max_size) / longest_side
	return Vector2i(maxi(1, roundi(size.x * scale)), maxi(1, roundi(size.y * scale)))


static func contact_sheet(images: Array, columns: int, gap: int) -> Image:
	if images.size() == 1:
		return images[0]
	var cell := Vector2i.ZERO
	for image in images:
		cell = cell.max((image as Image).get_size())
	var column_count := mini(columns, images.size())
	var row_count := ceili(images.size() / float(column_count))
	var sheet := Image.create_empty(column_count * cell.x + (column_count - 1) * gap, row_count * cell.y + (row_count - 1) * gap, false, Image.FORMAT_RGBA8)
	sheet.fill(SHEET_BACKGROUND)
	for index in images.size():
		var image := images[index] as Image
		if image.get_format() != Image.FORMAT_RGBA8:
			image = image.duplicate() as Image
			image.convert(Image.FORMAT_RGBA8)
		var column := index % column_count
		var row := floori(float(index) / column_count)
		sheet.blit_rect(image, Rect2i(Vector2i.ZERO, image.get_size()), Vector2i(column * (cell.x + gap), row * (cell.y + gap)))
	return sheet
