//
//  Created by Alexander Balaban.
//

final class Resolver {
    private enum FunctionType {
        case none
        case function
    }
    
    private let interpreter: Interpreter
    private let errorConsumer: ResolverErrorConsumer
    private var scopes = [[String: Bool]]()
    private var currentFunction: FunctionType = .none
    private var currentScope: [String: Bool]?
    
    init(interpreter: Interpreter,
         errorConsumer: ResolverErrorConsumer) {
        self.interpreter = interpreter
        self.errorConsumer = errorConsumer
    }
    
    func resolve(_ stmt: [Stmt]) {
        do {
            try stmt.forEach(resolve)
        } catch let e as ResolverError {
            errorConsumer.resolverError(token: e.token, message: e.message)
        } catch {
            fatalError(error.localizedDescription)
        }
    }
}
    
// MARK: - ExprVisitor
extension Resolver: ExprVisitor {
    typealias ER = Void
    
    func visit(_ expr: AssignExpr) throws -> Void {
        try resolve(expr.value)
        resolve(expr, expr.name)
    }
    
    func visit(_ expr: BinaryExpr) throws -> Void {
        try resolve(expr.left)
        try resolve(expr.right)
    }
    
    func visit(_ expr: CallExpr) throws -> Void {
        try resolve(expr.calee)
        try expr.args.forEach(resolve)
    }
    
    func visit(_ expr: GroupingExpr) throws -> Void {
        try resolve(expr.expr)
    }
    
    func visit(_ expr: LiteralExpr) throws -> Void { }
    
    func visit(_ expr: LogicalExpr) throws -> Void {
        try resolve(expr.left)
        try resolve(expr.right)
    }
    
    func visit(_ expr: UnaryExpr) throws -> Void {
        try resolve(expr.right)
    }
    
    func visit(_ expr: VariableExpr) throws -> Void {
        if currentScope != nil && currentScope?[expr.name.lexeme] == false {
            throw ResolverError(token: expr.name, message: "Can't read local variable in its own initializer.")
        }
        resolve(expr, expr.name)
    }
}

// MARK: - StmtVisitor
extension Resolver: StmtVisitor {
    typealias SR = Void
    
    func visit(_ stmt: BlockStmt) throws -> Void {
        scope {
            resolve(stmt.statements)
        }
    }
    
    func visit(_ stmt: ExpressionStmt) throws -> Void {
        try resolve(stmt.expression)
    }
    
    func visit(_ stmt: FuncStmt) throws -> Void {
        try declare(stmt.name)
        define(stmt.name)
        
        let enclosingFunction = currentFunction
        currentFunction = .function
        try scope {
            try stmt.params.forEach { token in
                try declare(token)
                define(token)
            }
            resolve(stmt.body)
        }
        currentFunction = enclosingFunction
    }
    
    func visit(_ stmt: IfStmt) throws -> Void {
        try resolve(stmt.condition)
        try resolve(stmt.then)
        if let `else` = stmt.else {
            try resolve(`else`)
        }
    }
    
    func visit(_ stmt: ReturnStmt) throws -> Void {
        guard currentFunction == .function else {
            throw ResolverError(token: stmt.keyword, message: "Can't return from top-level code.")
        }
        
        if let ret = stmt.value {
            try resolve(ret)
        }
    }
    
    func visit(_ stmt: VarStmt) throws -> Void {
        try declare(stmt.name)
        if let initializer = stmt.initializer {
            try resolve(initializer)
        }
        define(stmt.name)
    }
    
    func visit(_ stmt: WhileStmt) throws -> Void {
        try resolve(stmt.condition)
        try resolve(stmt.body)
    }
}

// MARK: - Helpers
private extension Resolver {
    func declare(_ token: Token) throws {
        guard currentScope?[token.lexeme] == nil else {
            throw ResolverError(token: token, message: "Already variable with this name in this scope.")
        }
        currentScope?[token.lexeme] = false
    }
    
    func define(_ token: Token) {
        currentScope?[token.lexeme] = true
    }
    
    func resolve(_ expr: Expr) throws {
        try expr.accept(visitor: self)
    }
    
    func resolve(_ stmt: Stmt) throws {
        try stmt.accept(visitor: self)
    }
    
    func resolve(_ expr: Expr, _ name: Token) {
        if currentScope?[name.lexeme] != nil {
            interpreter.resolve(expr, 0)
            return
        }
        for i in (0..<scopes.count).reversed() {
            if scopes[i][name.lexeme] != nil {
                interpreter.resolve(expr, scopes.count - i)
                break
            }
        }
    }
    
    func scope(_ closure: () throws -> Void) rethrows {
        defer { currentScope = scopes.count > 0 ? scopes.removeLast() : nil }
        if let scope = currentScope {
            scopes.append(scope)
        }
        currentScope = [String: Bool]()
        try closure()
    }
}
