//
//  Created by Alexander Balaban.
//

final class Token {
    let type: TokenType
    let lexeme: String 
    let literal: LoxObject
    let line: UInt 

    init(_ type: TokenType,
         _ lexeme: String,
         _ literal: LoxObject,
         _ line: UInt) {
        self.type = type
        self.lexeme = lexeme
        self.literal = literal
        self.line = line 
    }
}

extension Token: CustomStringConvertible {
    public var description: String {
        return "\(type) \(lexeme) \(String(describing: literal))"
    }
}
