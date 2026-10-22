extends RefCounted


static func resolve(path_or_uid: String) -> String:
	if not path_or_uid.begins_with("uid://"):
		return path_or_uid
	var uid := ResourceUID.text_to_id(path_or_uid)
	return ResourceUID.get_id_path(uid) if ResourceUID.has_id(uid) else path_or_uid
