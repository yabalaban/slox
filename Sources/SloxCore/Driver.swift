//
//  Created by Alexander Balaban.
//

public typealias OutputHandler = (String) -> Void

public final class Driver {
    private static var hadError = false
    private static var hadRuntimeError = false
    private var skipErrors = false
    private var outputHandler: OutputHandler
    private lazy var errorConsumer: ErrorConsumer = {
        ErrorConsumer(
            onError: { Driver.hadError = true },
            onRuntimeError: { Driver.hadRuntimeError = true },
            outputHandler: outputHandler
        )
    }()
    private lazy var interpreter: Interpreter = {
        Interpreter(errorConsumer: errorConsumer, outputHandler: outputHandler)
    }()

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

    public func getEnvironment() -> String {
        return interpreter.environment.description
    }
}
