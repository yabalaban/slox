//
//  Created by Alexander Balaban.
//

final class ErrorConsumer {
    private let onError: () -> Void
    private let onRuntimeError: () -> Void
    private let outputHandler: OutputHandler

    init(onError: @escaping () -> Void,
         onRuntimeError: @escaping () -> Void,
         outputHandler: @escaping OutputHandler = { print($0) }) {
        self.onError = onError
        self.onRuntimeError = onRuntimeError
        self.outputHandler = outputHandler
    }

    private func report(line: UInt, `where`: String, message: String) {
        outputHandler("[line \(line)] Error\(`where`.count > 0 ? " \(`where`)" : ""): \(message)")
        onError()
    }

    private func runtimeReport(line: UInt, `where`: String, message: String) {
        outputHandler("[line \(line)] Runtime error\(`where`.count > 0 ? " \(`where`)" : ""): \(message)")
        onRuntimeError()
    }
}

// MARK: - Scanner error handling
protocol ScannerErrorConsumer {
    func error(line: UInt, message: String)
}

extension ErrorConsumer: ScannerErrorConsumer {
    func error(line: UInt, message: String) {
        report(line: line, where: "", message: "\(message)")
    }
}

// MARK: - Parser error handling
protocol ParserErrorConsumer {
    func error(token: Token, message: String)
}

extension ErrorConsumer: ParserErrorConsumer {
    func error(token: Token, message: String) {
        let message = "\(message)"
        switch token.type {
        case .eof:
            report(line: token.line, where: "at end", message: message)
        default:
            report(line: token.line, where: "at '\(token.lexeme)'", message: message)
        }
    }
}

// MARK: - Resolver error handling
protocol ResolverErrorConsumer {
    func resolverError(token: Token, message: String)
}

struct ResolverError: Error {
    let token: Token
    let message: String
}

extension ErrorConsumer: ResolverErrorConsumer {
    func resolverError(token: Token, message: String) {
        report(line: token.line, where: "", message: message)
    }
}

// MARK: - Runtime error handling
protocol RuntimeErrorConsumer {
    func runtimeError(token: Token, message: String)
}

struct RuntimeError: Error {
    let token: Token
    let message: String
}

extension ErrorConsumer: RuntimeErrorConsumer {
    func runtimeError(token: Token, message: String) {
        report(line: token.line, where: "", message: message)
    }
}
