//
//  Created by Alexander Balaban.
//

final class Scanner {
    private struct ScannerError: Error {
        let line: UInt
        let message: String
    }
    
    private let source: String
    private let errorConsumer: ScannerErrorConsumer
    private lazy var start: String.Index = { source.startIndex }()
    private lazy var current: String.Index = { source.startIndex }()
    private var tokens = [Token]()
    private var line: UInt = 0
    
    init(source: String,
         errorConsumer: ScannerErrorConsumer) {
        self.source = source
        self.errorConsumer = errorConsumer
    }

    func scan() -> [Token] {
        while !done {
            start = current
            do {
                try scanToken()
            } catch let e as ScannerError {
                errorConsumer.error(line: e.line, message: e.message)
            } catch { }
        }

        addToken(type: .eof)
        return tokens
    }

    private func scanToken() throws {
        let char = advance()
        switch char {
        case "(": addToken(type: .leftParen)
        case ")": addToken(type: .rightParen)
        case "{": addToken(type: .leftBrace)
        case "}": addToken(type: .rightBrace)
        case ",": addToken(type: .comma)
        case ".": addToken(type: .dot)
        case "-": addToken(type: .minus)
        case "+": addToken(type: .plus)
        case ";": addToken(type: .semicolon)
        case "*": addToken(type: .star)
        case "!": addToken(type: match("=") ? .bangEqual : .bang)
        case "=": addToken(type: match("=") ? .equalEqual : .equal)
        case "<": addToken(type: match("=") ? .lessEqual : .less)
        case ">": addToken(type: match("=") ? .greaterEqual : .greater)
        case "/":
            if match("/") {
                while current != source.endIndex && advance() != "\n" { }
            } else if match("*") {
                try blockComment()
            } else {
                addToken(type: .slash)
            }
        case " ", "\r", "\t": break
        case "\n": line += 1
        case "\"": try string()
        default:
            if char.isNumber {
                try number()
            } else if char.isIdentifier {
                identifier()
            } else {
                throw ScannerError(line: line, message: "Unexpected character.")
            }
        }
    }
}

// MARK: - Matchers
private extension Scanner {
    func number() throws {
        let done = next(cond: { $0.isNumber })
        
        if !done && peek == "." && peekNext.isNumber {
            next()
            next(cond: { $0.isNumber })
        }
        
        let range = source[start..<current]
        guard let value = Double(range) else {
            throw ScannerError(line: line, message: "Internal error: can't cast '\(range)' to double.")
        }
        
        addToken(type: .number, literal: .double(value))
    }
    
    func string() throws {
        guard !next(cond: { $0 != "\"" }) else {
            throw ScannerError(line: line, message: "Unterminated string.")
        }

        next()
        let value = String(source[source.index(after: start)..<source.index(before: current)])
        addToken(type: .string, literal: .string(value))
    }
    
    func identifier() {
        next(cond: { $0.isNumber || $0.isIdentifier })
        addToken(type: TokenType(rawValue: String(source[start..<current])) ?? .identifier)
    }
    
    func blockComment() throws {
        var depth = 1
        while depth != 0 && current != source.endIndex {
            let char = advance()
            print(char)
            switch char {
            case "/":
                if match("*") {
                    depth += 1
                }
            case "*":
                if match("/") {
                    depth -= 1
                }
            default:
               break
            }
        }
        if depth != 0 {
            throw ScannerError(line: line, message: "Invalid multiline comment.")
        }
    }
}

// MARK: - Helpers
private extension Scanner {
    var peek: Character { source[current] }
    var peekNext: Character {
        let next = source.index(after: current)
        return next != source.endIndex ? source[next] : "\0"
    }
    var done: Bool { current == source.endIndex }
    
    func advance() -> Character {
        defer { next() }
        return peek
    }
    
    func match(_ char: Character) -> Bool {
        guard !done else { return false }
        guard peek == char else { return false }
        next()
        return true
    }
    
    @discardableResult
    func next(cond: (Character) -> Bool) -> Bool {
        while !done && cond(peek) {
            if peek == "\n" { line += 1 }
            next()
        }
        return done
    }
    
    func next() {
        current = source.index(after: current)
    }
    
    func addToken(type: TokenType, literal: LoxObject = .null) {
        let lexeme = type != .eof ? String(source[start..<current]) : ""
        tokens.append(
            Token(type, lexeme, literal, line)
        )
    }
}

// MARK: - Useful extensions
private extension Character {
    var isIdentifier: Bool { isLetter || self == "_" }
}
