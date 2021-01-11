//
//  Created by Alexander Balaban.
//

import Foundation

final class Driver {
    private static var hadError = false
    private static var hadRuntimeError = false
    private var skipErrors = false
    private lazy var errorConsumer: ErrorConsumer = {
        ErrorConsumer(
            onError: { Driver.hadError = true },
            onRuntimeError: { Driver.hadRuntimeError = true }
        )
    }()
    private lazy var interpreter: Interpreter = {
        Interpreter(errorConsumer: errorConsumer)
    }()

    func run(filepath: String) throws {
        run(try String(contentsOfFile: filepath))

        if Self.hadError {
            exit(65)
        }
        if Self.hadRuntimeError {
            exit(70)
        }
    }

    func repl() {
        self.skipErrors = true
        
        print("s(wift)lox repl – lox language interpreter written in Swift.")
        print("Ctrl-C to exit.")
        print(">>> ", terminator: "")

        while let input = readLine() {
            if input == "env" {
                print(interpreter.environment)
            } else {
                run(input)
            }
            Self.hadError = false
            Self.hadRuntimeError = false
            print(">>> ", terminator: "")
        }
    }

    private func run(_ source: String) {
        let scanner = Scanner(source: source,
                              errorConsumer: errorConsumer)
        let tokens = scanner.scan()
        let parser = Parser(tokens: tokens,
                            errorConsumer: errorConsumer)
        let statements = parser.parse()
        
        let resolver = Resolver(interpreter: interpreter,
                                errorConsumer: errorConsumer)
        resolver.resolve(statements)
        
        if !skipErrors {
            if Self.hadError {
                exit(65)
            }
            if Self.hadRuntimeError {
                exit(70)
            }
        }
        interpreter.interpret(statements)
    }
}
