const stringPrefixCharacters = new Set(['r', '&', '^']);
const identifierCharacterPattern = /[A-Za-z0-9_]/;

export function findGdscriptComments(source) {
  const comments = [];
  const scanner = new SourceScanner(source);
  while (!scanner.isAtEnd()) {
    const character = scanner.peek();
    if (character === '#') {
      comments.push(scanner.position());
      scanner.skipToEndOfLine();
    } else if (isQuote(character)) {
      scanner.skipString();
    } else if (startsPrefixedString(scanner)) {
      scanner.advance();
      scanner.skipString();
    } else {
      scanner.advance();
    }
  }
  return comments;
}

function isQuote(character) {
  return character === '"' || character === "'";
}

function startsPrefixedString(scanner) {
  return (
    stringPrefixCharacters.has(scanner.peek()) &&
    isQuote(scanner.peek(1)) &&
    !identifierCharacterPattern.test(scanner.previous())
  );
}

class SourceScanner {
  constructor(source) {
    this.source = source;
    this.index = 0;
    this.line = 1;
    this.column = 1;
  }

  isAtEnd() {
    return this.index >= this.source.length;
  }

  peek(offset = 0) {
    return this.source[this.index + offset] ?? '';
  }

  previous() {
    return this.source[this.index - 1] ?? '';
  }

  position() {
    return { line: this.line, column: this.column };
  }

  advance(count = 1) {
    for (let step = 0; step < count && !this.isAtEnd(); step += 1) {
      if (this.source[this.index] === '\n') {
        this.line += 1;
        this.column = 1;
      } else {
        this.column += 1;
      }
      this.index += 1;
    }
  }

  skipToEndOfLine() {
    while (!this.isAtEnd() && this.peek() !== '\n') {
      this.advance();
    }
  }

  skipString() {
    const quote = this.peek();
    const isTripleQuoted = this.peek(1) === quote && this.peek(2) === quote;
    const delimiter = isTripleQuoted ? quote.repeat(3) : quote;
    this.advance(delimiter.length);
    while (!this.isAtEnd()) {
      if (this.peek() === '\\') {
        this.advance(2);
      } else if (this.source.startsWith(delimiter, this.index)) {
        this.advance(delimiter.length);
        return;
      } else if (!isTripleQuoted && this.peek() === '\n') {
        return;
      } else {
        this.advance();
      }
    }
  }
}
