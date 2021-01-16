//
//  Created by Alexander Balaban.
//

final class LoxClass {
    let name: String
    let superclass: LoxClass?
    let methods: [String: LoxFunction]
    
    init(name: String,
         superclass: LoxClass?,
         methods: [String: LoxFunction]) {
        self.name = name
        self.superclass = superclass
        self.methods = methods
    }
    
    func findMethod(_ name: String) -> LoxFunction? {
        return methods[name] ?? superclass?.findMethod(name)
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
