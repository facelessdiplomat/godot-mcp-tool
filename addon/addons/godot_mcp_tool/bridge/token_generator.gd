extends RefCounted

const TOKEN_BYTE_COUNT := 16


static func generate() -> String:
	return Marshalls.raw_to_base64(Crypto.new().generate_random_bytes(TOKEN_BYTE_COUNT))
