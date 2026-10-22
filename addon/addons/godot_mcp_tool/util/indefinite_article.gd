extends RefCounted

const VOWELS := "AEIOUaeiou"


static func before(word: String) -> String:
	var article := "an" if not word.is_empty() and VOWELS.contains(word[0]) else "a"
	return "%s %s" % [article, word]
