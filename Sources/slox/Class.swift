//
//  Created by Alexander Balaban.
//

final class LoxClass {
    let name: String
    let methods: [String: LoxFunction]
    
    init(name: String,
         methods: [String: LoxFunction]) {
        self.name = name
        self.methods = methods
    }
    
    func findMethod(_ name: String) -> LoxFunction? {
        return methods[name]
    }
}

// MARK: - Callable
extension LoxClass: Callable {
    var arity: Int { findMethod("init")?.arity ?? 0 }
    
    func call(_ interpreter: Interpreter, _ args: [LoxObject]) throws -> LoxObject {
        let instance = LoxInstance(klass: self)
        if let initializer = findMethod("init") {
            _ = try initializer.bind(instance).call(interpreter, args)
        }
        return .instance(instance)
    }
}

// MARK: - CustomStringConvertible
extension LoxClass: CustomStringConvertible {
    var description: String { name }
}
