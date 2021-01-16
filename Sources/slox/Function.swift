//
//  Created by Alexander Balaban.
//

import Foundation

protocol Callable {
    var arity: Int { get }
    
    func call(_ interpreter: Interpreter, _ args: [LoxObject]) throws -> LoxObject
}

final class LoxFunction: Callable, CustomStringConvertible {
    var arity: Int { declaration.params.count }
    var description: String { "<fn \(declaration.name.lexeme)>" }
    private let declaration: FuncStmt
    private let closure: Environment
    private let isInitializer: Bool
    
    init(declaration: FuncStmt,
         closure: Environment,
         isInitializer: Bool) {
        self.closure = closure
        self.declaration = declaration
        self.isInitializer = isInitializer
    }
    
    func call(_ interpreter: Interpreter, _ args: [LoxObject]) throws -> LoxObject {
        let env = Environment(enclosing: closure)
        for i in 0..<args.count {
            env.define(name: declaration.params[i].lexeme, value: args[i])
        }
        do {
            try interpreter.execute(declaration.body, env)
        } catch let e as Interpreter.Return {
            if isInitializer {
                return try returnInit()
            }
            return e.obj
        }
        
        if isInitializer {
            return try returnInit()
        }
        return .null
    }
    
    func bind(_ instance: LoxInstance) -> LoxFunction {
        let env = Environment(enclosing: closure)
        env.define(name: "this", value: .instance(instance))
        return LoxFunction(declaration: declaration, closure: env, isInitializer: isInitializer)
    }
    
    func returnInit() throws -> LoxObject {
        guard let initializer = closure.get("init") else { fatalError() }
        return initializer
    }
}

// MARK: - Native functions
protocol NativeFunction: Callable, CustomStringConvertible { }
extension NativeFunction {
    var description: String { "<native-fn \(Self.self)>" }
}

final class ClockNativeFunction: NativeFunction {
    let arity: Int = 0
    
    func call(_ interpreter: Interpreter, _ args: [LoxObject]) throws -> LoxObject {
        return .double(Date().timeIntervalSince1970)
    }
}

final class PrintNativeFunction: NativeFunction {
    let arity: Int = 1
    
    func call(_ interpreter: Interpreter, _ args: [LoxObject]) throws -> LoxObject {
        print(args[0])
        return .null
    }
}
