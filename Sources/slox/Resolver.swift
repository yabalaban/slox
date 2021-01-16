//
//  Created by Alexander Balaban.
//

final class Resolver {
    enum ClassType {
        case none
        case klass
        case subclass
    }
    enum FunctionType {
        case none
        case function
        case initializer
        case method
    }
    
    private let interpreter: Interpreter
    private let errorConsumer: ResolverErrorConsumer
    private var scopes = [[String: Bool]]()
    private var currentClass: ClassType = .none
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
    
    func visit(_ expr: GetExpr) throws -> Void {
        try resolve(expr.object)
    }
    
    func visit(_ expr: GroupingExpr) throws -> Void {
        try resolve(expr.expr)
    }
    
    func visit(_ expr: LiteralExpr) throws -> Void { }
    
    func visit(_ expr: LogicalExpr) throws -> Void {
        try resolve(expr.left)
        try resolve(expr.right)
    }
    
    func visit(_ expr: SetExpr) throws -> Void {
        try resolve(expr.value)
        try resolve(expr.object)
    }
    
    func visit(_ expr: SuperExpr) throws -> Void {
        switch currentClass {
        case .none:
            throw ResolverError(token: expr.keyword, message: "Can't use 'super' outside of a class.")
        case .klass:
            throw ResolverError(token: expr.keyword, message: "Can't use 'super' in a class with no superclass.")
        case .subclass:
            resolve(expr, expr.keyword)
        }
    }
    
    func visit(_ expr: ThisExpr) throws -> Void {
        guard currentClass == .klass else { throw ResolverError(token: expr.keyword, message: "Can't use 'this' outside of a class.") }
        resolve(expr, expr.keyword)
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
    
    func visit(_ stmt: ClassStmt) throws -> Void {
        let enclosingClass = currentClass
        currentClass = .klass
        try declare(stmt.name)
        define(stmt.name)
        
        if let superclass = stmt.superclass {
            currentClass = .subclass
            guard superclass.name.lexeme != stmt.name.lexeme else {
                throw ResolverError(token: superclass.name, message: "A class can't inherit from itself.")
            }
            try resolve(superclass)
        }
        
        try scope {
            if stmt.superclass != nil {
                currentScope?["super"] = true
            }
            
            try scope {
                currentScope?["this"] = true
                try stmt.methods.forEach({ try resolve($0, $0.name.lexeme == "init" ? .initializer : .method) })
            }
        }
        
        currentClass = enclosingClass
    }
    
    func visit(_ stmt: ExpressionStmt) throws -> Void {
        try resolve(stmt.expression)
    }
    
    func visit(_ stmt: FuncStmt) throws -> Void {
        try declare(stmt.name)
        define(stmt.name)
        try resolve(stmt, .function)
    }
    
    func visit(_ stmt: IfStmt) throws -> Void {
        try resolve(stmt.condition)
        try resolve(stmt.then)
        if let `else` = stmt.else {
            try resolve(`else`)
        }
    }
    
    func visit(_ stmt: ReturnStmt) throws -> Void {
        guard currentFunction == .function || currentFunction == .method else {
            throw ResolverError(token: stmt.keyword, message: "Can't return from top-level code.")
        }
        
        if let ret = stmt.value {
            guard currentFunction != .initializer else {
                throw ResolverError(token: stmt.keyword, message: "Can't return from an initializer.")
            }
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
    
    func resolve(_ stmt: FuncStmt, _ declaration: FunctionType) throws {
        let enclosingFunction = currentFunction
        currentFunction = declaration
        try scope {
            try stmt.params.forEach { token in
                try declare(token)
                define(token)
            }
            resolve(stmt.body)
        }
        currentFunction = enclosingFunction
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
