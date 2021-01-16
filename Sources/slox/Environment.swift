//
//  Created by Alexander Balaban.
//

final class Environment: CustomStringConvertible {
    private let enclosing: Environment?
    private var values = [String: LoxObject]()
    var description: String { values.description }
    
    init(enclosing: Environment? = nil) {
        self.enclosing = enclosing
    }
    
    func assign(at distance: Int = 0, name: Token, value: LoxObject?) {
        ancestor(distance).values[name.lexeme] = value
    }
    
    func define(name: String, value: LoxObject) {
        values[name] = value
    }
    
    func get(at distance: Int, _ name: Token) throws -> LoxObject {
        return try ancestor(distance).get(name: name)
    }
    
    func get(_ name: String) -> LoxObject? {
        return values[name]
    }
    
    func get(name: Token) throws -> LoxObject {
        if let value = values[name.lexeme] {
            return value
        } else if let value = try enclosing?.get(name: name) {
            return value
        } else {
            throw RuntimeError(token: name, message: "Undefined variable \(name.lexeme).")
        }
    }
    
    private func ancestor(_ depth: Int) -> Environment {
        var env = self
        for _ in 0..<depth {
            guard let enc = env.enclosing else { break }
            env = enc
        }
        return env
    }
}
