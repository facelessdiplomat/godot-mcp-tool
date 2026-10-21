extends RefCounted

const SHORT_HASH_LENGTH := 9


static func from_version_info(version_info: Dictionary) -> String:
	var version_numbers := "%d.%d" % [version_info.get("major", 0), version_info.get("minor", 0)]
	var patch: int = version_info.get("patch", 0)
	if patch > 0:
		version_numbers += ".%d" % patch
	var parts := PackedStringArray([version_numbers, version_info.get("status", ""), version_info.get("build", "")])
	var commit_hash: String = version_info.get("hash", "")
	if not commit_hash.is_empty():
		parts.append(commit_hash.left(SHORT_HASH_LENGTH))
	return ".".join(parts)
