//
//  Created by Alexander Balaban.
//

final class Interpreter {
    struct Return: Error {
        let obj: LoxObject
    }

    let globals = Environment()
    lazy var environment: Environment = { globals }()
    private let errorConsumer: RuntimeErrorConsumer
    private let outputHandler: OutputHandler
    private var locals = [String: Int]()

    init(errorConsumer: RuntimeErrorConsumer, outputHandler: @escaping OutputHandler = { print($0) }) {
        self.errorConsumer = errorConsumer
        self.outputHandler = outputHandler
        globals.define(
            name: "clock",
            value: .callable(ClockNativeFunction())
        )
        globals.define(
            name: "print",
            value: .callable(PrintNativeFunction(outputHandler: outputHandler))
        )
    }

    func execute(_ stmts: [Stmt], _ env: Environment) throws {
        let previous = environment
        defer { environment = previous }
        environment = env
        for stmt in stmts {
            try execute(stmt)
        }
    }

    func interpret(_ stmts: [Stmt]) {
        do {
            for stmt in stmts {
                try execute(stmt)
            }
        } catch let e as RuntimeError {
            errorConsumer.runtimeError(token: e.token, message: e.message)
        } catch {
            fatalError(error.localizedDescription)
        }
    }

    func resolve(_ expr: Expr, _ depth: Int) {
        locals[expr.description] = depth
    }
}

// MARK: - Expressions Visitor
extension Interpreter: ExprVisitor {
    typealias ER = LoxObject

    func visit(_ expr: AssignExpr) throws -> LoxObject {
        let value = try evaluate(expr.value)
        if let distance = locals[expr.description] {
            environment.assign(at: distance, name: expr.name, value: value)
        } else {
            globals.assign(name: expr.name, value: value)
        }
        return value
    }

    func visit(_ expr: BinaryExpr) throws -> LoxObject {
        let left = try evaluate(expr.left)
        let right = try evaluate(expr.right)

        switch (left, right) {
        case (.double(let lhs), .double(let rhs)):
            switch expr.op.type {
            case .bangEqual:
                return .bool(lhs != rhs)
            case .equalEqual:
                return .bool(lhs == rhs)
            case .minus:
                return .double(lhs - rhs)
            case .plus:
                return .double(lhs + rhs)
            case .slash:
                guard rhs != 0 else {
                    throw RuntimeError(token: expr.op, message: "Division by zero.")
                }
                return .double(lhs / rhs)
            case .star:
                return .double(lhs * rhs)
            case .greater:
                return .bool(lhs > rhs)
            case .greaterEqual:
                return .bool(lhs >= rhs)
            case .less:
                return .bool(lhs < rhs)
            case .lessEqual:
                return .bool(lhs <= rhs)
            default:
                throw RuntimeError(token: expr.op, message: "Double operands don't support this operation.")
            }
        case (.string(let lhs), .string(let rhs)):
            switch expr.op.type {
            case .bangEqual:
                return .bool(lhs != rhs)
            case .equalEqual:
                return .bool(lhs == rhs)
            case .plus:
                return .string(lhs + rhs)
            default:
                throw RuntimeError(token: expr.op, message: "String operands don't support this operation.")
            }
        case (.bool(let lhs), .bool(let rhs)):
            switch expr.op.type {
            case .bangEqual:
                return .bool(lhs != rhs)
            case .equalEqual:
                return .bool(lhs == rhs)
            default:
                throw RuntimeError(token: expr.op, message: "Bool operands don't support this operation.")
            }
        default:
            switch expr.op.type {
            case .bangEqual:
                return .bool(!isEqual(left, right))
            case .equalEqual:
                return .bool(isEqual(left, right))
            default:
                throw RuntimeError(token: expr.op, message: "Operands don't support this operation.")
            }
        }
    }

    func visit(_ expr: CallExpr) throws -> LoxObject {
        let obj = try evaluate(expr.calee)
        var args = [LoxObject]()
        for arg in expr.args {
            args.append(try evaluate(arg))
        }
        let callable: Callable
        if case let .callable(function) = obj {
            callable = function
        } else if case let .klass(klass) = obj {
            callable = klass
        } else {
            throw RuntimeError(token: expr.paren, message: "Can only call functions and classes.")
        }
        guard callable.arity == args.count else {
            throw RuntimeError(token: expr.paren, message: "Expected \(callable.arity) arguments but got \(args.count).")
        }
        return try callable.call(self, args)
    }

    func visit(_ expr: GetExpr) throws -> LoxObject {
        let obj = try evaluate(expr.object)
        guard case let .instance(inst) = obj else {
            throw RuntimeError(token: expr.name, message: "Only instances have properties.")
        }
        return try inst.get(expr.name)
    }

    func visit(_ expr: GroupingExpr) throws -> LoxObject {
        return try evaluate(expr.expr)
    }

    func visit(_ expr: LiteralExpr) throws -> LoxObject {
        return expr.object
    }

    func visit(_ expr: LogicalExpr) throws -> LoxObject {
        let left = try evaluate(expr.left)

        switch expr.op.type {
        case .and where !isTruthy(left):
            return .bool(false)
        case .or where isTruthy(left):
            return .bool(true)
        default:
            return try evaluate(expr.right)
        }
    }

    func visit(_ expr: SetExpr) throws -> LoxObject {
        let obj = try evaluate(expr.object)
        guard case let .instance(inst) = obj else {
            throw RuntimeError(token: expr.name, message: "Only instances have fields.")
        }
        let val = try evaluate(expr.value)
        inst.set(expr.name, val)
        return val
    }

    func visit(_ expr: SuperExpr) throws -> LoxObject {
        guard let distance = locals[expr.description] else { return .null }
        guard case let .klass(superclass) = try environment.get(at: distance, "super") else { return .null }
        guard case let .instance(object) = try environment.get(at: distance - 1, "this") else { return .null }
        guard let method = superclass.findMethod(expr.method.lexeme) else {
            throw RuntimeError(token: expr.method, message: "Undefined property '\(expr.method.lexeme)'.")
        }
        return .callable(method.bind(object))
    }

    func visit(_ expr: ThisExpr) throws -> LoxObject {
        return .null
    }

    func visit(_ expr: UnaryExpr) throws -> LoxObject {
        let right = try evaluate(expr.right)
        switch expr.op.type {
        case .bang:
            return .bool(!isTruthy(right))
        case .minus:
            switch right {
            case .double(let val):
                return .double(-val)
            default:
                throw RuntimeError(token: expr.op, message: "Invalid unary operand for -.")
            }
        default:
            throw RuntimeError(token: expr.op, message: "Invalid unary operation for given operand.")
        }
    }

    func visit(_ expr: VariableExpr) throws -> LoxObject {
        return try lookup(expr.name, expr)
    }
}

// MARK: - Statements Visitor
extension Interpreter: StmtVisitor {
    typealias SR = Void

    func visit(_ stmt: BlockStmt) throws -> Void {
        try execute(stmt.statements, Environment(enclosing: environment))
    }

    func visit(_ stmt: ClassStmt) throws -> Void {
        var superklass: LoxClass?
        if let superclass = stmt.superclass {
            let res = try evaluate(superclass)
            guard case .klass(let superk) = res else {
                throw RuntimeError(token: stmt.name, message: "Superclass must be a class.")
            }
            superklass = superk
        }

        environment.define(name: stmt.name.lexeme, value: .null)
        if let superklass = superklass {
            environment = Environment(enclosing: environment)
            environment.define(name: "super", value: .klass(superklass))
        }

        let methods = stmt.methods.reduce(into: [String: LoxFunction](), { res, method in
            res[method.name.lexeme] = LoxFunction(declaration: method,
                                                  closure: environment,
                                                  isInitializer: method.name.lexeme == "init")
        })
        let klass = LoxClass(name: stmt.name.lexeme, superclass: superklass, methods: methods)
        if superklass != nil, let enclosing = environment.enclosing {
            environment = enclosing
        }
        environment.assign(name: stmt.name, value: .klass(klass))
    }

    func visit(_ stmt: ExpressionStmt) throws -> Void {
        try evaluate(stmt.expression)
    }

    func visit(_ stmt: FuncStmt) throws -> Void {
        let function = LoxFunction(declaration: stmt, closure: environment, isInitializer: false)
        environment.define(
            name: stmt.name.lexeme,
            value: .callable(function)
        )
    }

    func visit(_ stmt: IfStmt) throws -> Void {
        if isTruthy(try evaluate(stmt.condition)) {
            try execute(stmt.then)
        } else if let `else` = stmt.else {
            try execute(`else`)
        }
    }

    func visit(_ stmt: ReturnStmt) throws -> Void {
        var value: LoxObject = .null
        if let v = stmt.value {
            value = try evaluate(v)
        }
        throw Return(obj: value)
    }

    func visit(_ stmt: VarStmt) throws -> Void {
        var res: LoxObject = .null
        if let initializer = stmt.initializer {
            res = try evaluate(initializer)
        }
        environment.define(name: stmt.name.lexeme, value: res)
    }

    func visit(_ stmt: WhileStmt) throws -> Void {
        while isTruthy(try evaluate(stmt.condition)) {
            try execute(stmt.body)
        }
    }
}

// MARK: - Helpers
private extension Interpreter {
    @discardableResult
    func evaluate(_ expr: Expr) throws  -> LoxObject {
        return try expr.accept(visitor: self)
    }

    func execute(_ stmt: Stmt) throws {
        try stmt.accept(visitor: self)
    }

    func isTruthy(_ val: LoxObject) -> Bool {
        switch val {
        case .null:
            return false
        case .bool(let val):
            return val
        default:
            return true
        }
    }

    func isTruthy(_ val: Any?) -> Bool {
        guard val != nil else { return false }
        guard let b = val as? Bool else { return true }
        return b
    }

    func isEqual(_ lhs: LoxObject, _ rhs: LoxObject) -> Bool {
        switch (lhs, rhs) {
        case (let .double(l), let .double(r)):
            return l == r
        case (let .string(l), let .string(r)):
            return l == r
        case (.null, .null):
            return true
        default:
            return false
        }
    }

    func lookup(_ name: Token, _ expr: VariableExpr) throws -> LoxObject {
        if let distance = locals[expr.description] {
            return try environment.get(at: distance, name)
        } else {
            return try globals.get(name: name)
        }
    }
}
