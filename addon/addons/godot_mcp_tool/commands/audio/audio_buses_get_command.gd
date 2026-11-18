extends "../command.gd"

const GodotMcpAudioBusLayoutFile := preload("../../audio/audio_bus_layout_file.gd")
const GodotMcpAudioBuses := preload("../../audio/audio_buses.gd")

var _layout_file: GodotMcpAudioBusLayoutFile


func _init(layout_file: GodotMcpAudioBusLayoutFile) -> void:
	_layout_file = layout_file


func execute(_params: Dictionary) -> Variant:
	return {"layout": _layout_file.path(), "saved": _layout_file.exists(), "buses": GodotMcpAudioBuses.describe_all()}
