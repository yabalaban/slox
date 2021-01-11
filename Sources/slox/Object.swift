//
//  Created by Alexander Balaban.
//

enum LoxObject: CustomStringConvertible {
    case bool(Bool)
    case callable(Callable)
    case double(Double)
    case null
    case string(String)
    
    var description: String {
        switch self {
        case let .bool(val):
            return "\(val)"
        case let .callable(val):
            return "\(val)"
        case let .double(val):
            return "\(val)"
        case .null:
            return "nil"
        case let .string(val):
            return "\(val)"
        }
    }
}
