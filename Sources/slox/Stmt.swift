//
//  Created by Alexander Balaban.
//

protocol StmtVisitor {
    associatedtype SR
    
    func visit(_ stmt: BlockStmt) throws -> SR
    func visit(_ stmt: ClassStmt) throws -> SR
    func visit(_ stmt: ExpressionStmt) throws -> SR
    func visit(_ stmt: FuncStmt) throws -> SR
    func visit(_ stmt: IfStmt) throws -> SR
    func visit(_ stmt: ReturnStmt) throws -> SR
    func visit(_ stmt: VarStmt) throws -> SR
    func visit(_ stmt: WhileStmt) throws -> SR
}

protocol Stmt {
    func accept<Visitor: StmtVisitor>(visitor: Visitor) throws -> Visitor.SR
}

final class BlockStmt: Stmt {
    let statements: [Stmt]
    
    init(statements: [Stmt]) {
        self.statements = statements
    }
    
    func accept<Visitor: StmtVisitor>(visitor: Visitor) throws -> Visitor.SR {
        return try visitor.visit(self)
    }
}

final class ClassStmt: Stmt {
    let name: Token
    let methods: [FuncStmt]
    
    init(name: Token, methods: [FuncStmt]) {
        self.name = name
        self.methods = methods
    }
    
    func accept<Visitor: StmtVisitor>(visitor: Visitor) throws -> Visitor.SR {
        return try visitor.visit(self)
    }
}

final class ExpressionStmt: Stmt {
    let expression: Expr
    
    init(expression: Expr) {
        self.expression = expression
    }
    
    func accept<Visitor: StmtVisitor>(visitor: Visitor) throws -> Visitor.SR {
        return try visitor.visit(self)
    }
}

final class FuncStmt: Stmt {
    let name: Token
    let params: [Token]
    let body: [Stmt]
    
    init(name: Token, params: [Token], body: [Stmt]) {
        self.name = name
        self.params = params
        self.body = body
    }
    
    func accept<Visitor: StmtVisitor>(visitor: Visitor) throws -> Visitor.SR {
        return try visitor.visit(self)
    }
}

final class IfStmt: Stmt {
    let condition: Expr
    let then: Stmt
    let `else`: Stmt?
    
    init(condition: Expr,
         then: Stmt,
         `else`: Stmt?) {
        self.condition = condition
        self.then = then
        self.else = `else`;
    }
    
    func accept<Visitor: StmtVisitor>(visitor: Visitor) throws -> Visitor.SR {
        return try visitor.visit(self)
    }
}

final class ReturnStmt: Stmt {
    let keyword: Token
    let value: Expr?
    
    init(keyword: Token, value: Expr?) {
        self.keyword = keyword
        self.value = value
    }
    
    func accept<Visitor: StmtVisitor>(visitor: Visitor) throws -> Visitor.SR {
        return try visitor.visit(self)
    }
}

final class VarStmt: Stmt {
    let name: Token
    let initializer: Expr?
    
    init(name: Token,
         initializer: Expr?) {
        self.name = name
        self.initializer = initializer
    }
    
    func accept<Visitor: StmtVisitor>(visitor: Visitor) throws -> Visitor.SR {
        return try visitor.visit(self)
    }
}

final class WhileStmt: Stmt {
    let condition: Expr
    let body: Stmt
    
    init(condition: Expr,
         body: Stmt) {
        self.condition = condition
        self.body = body
    }
    
    func accept<Visitor: StmtVisitor>(visitor: Visitor) throws -> Visitor.SR {
        return try visitor.visit(self)
    }
}
