extends GutTest

const ImageFitter := preload("res://addons/godot_mcp_tool/capture/image_fitter.gd")


func _image(width: int, height: int, color: Color) -> Image:
	var image := Image.create_empty(width, height, false, Image.FORMAT_RGBA8)
	image.fill(color)
	return image


func test_shrinks_an_image_to_its_longest_side() -> void:
	var fitted := ImageFitter.fit(_image(2560, 1440, Color.RED), 1280)
	assert_eq(fitted.get_size(), Vector2i(1280, 720))


func test_shrinks_a_tall_image_by_its_height() -> void:
	assert_eq(ImageFitter.fit(_image(600, 1200, Color.RED), 300).get_size(), Vector2i(150, 300))


func test_never_enlarges_an_image() -> void:
	assert_eq(ImageFitter.fit(_image(640, 360, Color.RED), 1280).get_size(), Vector2i(640, 360))


func test_lays_images_out_in_a_grid() -> void:
	var sheet := ImageFitter.contact_sheet([_image(100, 50, Color.RED), _image(100, 50, Color.GREEN), _image(100, 50, Color.BLUE)], 2, 4)
	assert_eq(sheet.get_size(), Vector2i(204, 104))
	assert_eq(sheet.get_pixel(10, 10), Color.RED)
	assert_eq(sheet.get_pixel(114, 10), Color.GREEN)
	assert_eq(sheet.get_pixel(10, 64), Color.BLUE)


func test_turns_a_single_image_into_itself() -> void:
	var sheet := ImageFitter.contact_sheet([_image(100, 50, Color.RED)], 2, 4)
	assert_eq(sheet.get_size(), Vector2i(100, 50))


func test_computes_the_fitted_size_without_an_image() -> void:
	assert_eq(ImageFitter.fitted_size(Vector2i(2308, 1202), 1280), Vector2i(1280, 667))
	assert_eq(ImageFitter.fitted_size(Vector2i(640, 360), 1280), Vector2i(640, 360))


func test_resizes_an_image_to_a_given_size() -> void:
	assert_eq(ImageFitter.resized(_image(2304, 1296, Color.RED), Vector2i(1152, 648)).get_size(), Vector2i(1152, 648))


func test_keeps_an_image_that_already_has_the_size() -> void:
	var image := _image(640, 360, Color.RED)
	assert_same(ImageFitter.resized(image, Vector2i(640, 360)), image)
