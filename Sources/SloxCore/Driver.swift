//
//  Driver.swift
//  SloxCore
//
//  Created by Alexander Balaban.
//
//  The Driver is the main entry point for executing Lox source code.
//  It orchestrates scanning, parsing, resolving, and interpreting.
//

/// Callback type for handling interpreter output (print statements, results)
public typealias OutputHandler = (String) -> Void

/// Main driver class that coordinates the Lox interpreter pipeline.
/// Supports both batch execution and REPL-style interactive execution.
public final class Driver {

    // MARK: - Error State (static for cross-component access)

    private static var hadError = false
    private static var hadRuntimeError = false

    // MARK: - Instance Properties

    private var outputHandler: OutputHandler

    // Lazy-initialized components (allows reset by setting to nil)
    private var _errorConsumer: ErrorConsumer?
    private var _interpreter: Interpreter?

    /// Error consumer that tracks parse/runtime errors
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

    /// The Lox interpreter instance
    private var interpreter: Interpreter {
        if _interpreter == nil {
            _interpreter = Interpreter(errorConsumer: errorConsumer, outputHandler: outputHandler)
        }
        return _interpreter!
    }

    // MARK: - Initialization

    /// Creates a new Driver with the specified output handler.
    /// - Parameter outputHandler: Callback for print output. Defaults to stdout.
    public init(outputHandler: @escaping OutputHandler = { print($0) }) {
        self.outputHandler = outputHandler
    }

    // MARK: - Execution Methods

    /// Executes Lox source code (batch mode, no return value).
    /// Errors are reported via the output handler.
    /// - Parameter source: The Lox source code to execute
    public func run(source: String) {
        Self.hadError = false
        Self.hadRuntimeError = false

        // Scanning: source -> tokens
        let scanner = Scanner(source: source, errorConsumer: errorConsumer)
        let tokens = scanner.scan()

        // Parsing: tokens -> AST
        let parser = Parser(tokens: tokens, errorConsumer: errorConsumer)
        let statements = parser.parse()

        // Resolution: resolve variable bindings
        let resolver = Resolver(interpreter: interpreter, errorConsumer: errorConsumer)
        resolver.resolve(statements)

        // Interpretation: execute the AST
        interpreter.interpret(statements)
    }

    /// Executes Lox source code in REPL mode, returning the result.
    /// Always returns the value of the last expression (or nil on error).
    /// - Parameter source: The Lox source code to execute
    /// - Returns: String representation of the result, or nil if error occurred
    public func runRepl(source: String) -> String? {
        Self.hadError = false
        Self.hadRuntimeError = false

        let scanner = Scanner(source: source, errorConsumer: errorConsumer)
        let tokens = scanner.scan()

        let parser = Parser(tokens: tokens, errorConsumer: errorConsumer)
        let statements = parser.parse()

        // Abort if parse errors occurred
        guard !Self.hadError else { return nil }

        let resolver = Resolver(interpreter: interpreter, errorConsumer: errorConsumer)
        resolver.resolve(statements)

        // Abort if resolution errors occurred
        guard !Self.hadError else { return nil }

        return interpreter.interpretRepl(statements)
    }

    // MARK: - Introspection (for magic commands)

    /// Returns string representation of current local environment.
    public func getEnvironment() -> String {
        return interpreter.environment.description
    }

    /// Returns string representation of global scope (built-ins + user definitions).
    public func getGlobals() -> String {
        return interpreter.globals.description
    }

    /// Resets interpreter state, clearing all user-defined variables and functions.
    /// Built-in functions (clock, print) are recreated on next use.
    public func reset() {
        _interpreter = nil
        _errorConsumer = nil
    }
}
