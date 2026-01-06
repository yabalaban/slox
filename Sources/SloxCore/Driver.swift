//
//  Created by Alexander Balaban.
//

public typealias OutputHandler = (String) -> Void

public final class Driver {
    private static var hadError = false
    private static var hadRuntimeError = false
    private var skipErrors = false
    private var outputHandler: OutputHandler
    private var _errorConsumer: ErrorConsumer?
    private var _interpreter: Interpreter?

    private var errorConsumer: ErrorConsumer {
        if _errorConsumer == nil {
            _errorConsumer = ErrorConsumer(
                onError: { Driver.hadError = true },
                onRuntimeError: { Driver.hadRuntimeError = true },
                outputHandler: outputHandler
            )
        }
        return _errorConsumer!
    }

    private var interpreter: Interpreter {
        if _interpreter == nil {
            _interpreter = Interpreter(errorConsumer: errorConsumer, outputHandler: outputHandler)
        }
        return _interpreter!
    }

    public init(outputHandler: @escaping OutputHandler = { print($0) }) {
        self.outputHandler = outputHandler
    }

    public func run(source: String) {
        Self.hadError = false
        Self.hadRuntimeError = false
        self.skipErrors = true

        let scanner = Scanner(source: source,
                              errorConsumer: errorConsumer)
        let tokens = scanner.scan()
        let parser = Parser(tokens: tokens,
                            errorConsumer: errorConsumer)
        let statements = parser.parse()

        let resolver = Resolver(interpreter: interpreter,
                                errorConsumer: errorConsumer)
        resolver.resolve(statements)

        interpreter.interpret(statements)
    }

    /// REPL-style run that returns the result of the last expression
    public func runRepl(source: String) -> String? {
        Self.hadError = false
        Self.hadRuntimeError = false
        self.skipErrors = true

        let scanner = Scanner(source: source,
                              errorConsumer: errorConsumer)
        let tokens = scanner.scan()
        let parser = Parser(tokens: tokens,
                            errorConsumer: errorConsumer)
        let statements = parser.parse()

        guard !Self.hadError else { return nil }

        let resolver = Resolver(interpreter: interpreter,
                                errorConsumer: errorConsumer)
        resolver.resolve(statements)

        guard !Self.hadError else { return nil }

        return interpreter.interpretRepl(statements)
    }

    public func getEnvironment() -> String {
        return interpreter.environment.description
    }

    public func getGlobals() -> String {
        return interpreter.globals.description
    }

    /// Reset interpreter state (clear all variables and functions)
    public func reset() {
        _interpreter = nil
        _errorConsumer = nil
    }
}
