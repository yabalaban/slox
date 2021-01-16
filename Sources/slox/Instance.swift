//
//  Created by Alexander Balaban.
//

final class LoxInstance {
    private let klass: LoxClass
    private var fields = [String: LoxObject]()
    
    init(klass: LoxClass) {
        self.klass = klass
    }
    
    func get(_ name: Token) throws -> LoxObject {
        if let field = fields[name.lexeme] {
            return field
        }
        if let method = klass.findMethod(name.lexeme) {
            return .callable(method.bind(self))
        }
        throw RuntimeError(token: name, message: "Undefined property '\(name.lexeme)'.")
    }
    
    func set(_ name: Token, _ object: LoxObject) {
        fields[name.lexeme] = object
    }
}

// MARK: - CustomStringConvertible
extension LoxInstance: CustomStringConvertible {
    var description: String { "\(klass) instance" }
}
