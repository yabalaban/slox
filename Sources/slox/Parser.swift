//
//  Created by Alexander Balaban.
//

final class Parser {
    private struct ParserError: Error {
        let token: Token
        let message: String
    }
    
    private let tokens: [Token]
    private let errorConsumer: ParserErrorConsumer
    private var current = 0
    
    init(tokens: [Token],
         errorConsumer: ParserErrorConsumer) {
        self.tokens = tokens
        self.errorConsumer = errorConsumer
    }
    
    func parse() -> [Stmt] {
        var stmts = [Stmt]()
        while !done {
            guard let stmt = declaration() else { return stmts }
            stmts.append(stmt)
        }
        return stmts
    }
}

// MARK: - Expressions grammar
private extension Parser {
    // assignment → ( call "." )? IDENTIFIER "=" assignment
    //            | logicOr ;
    func assignment() throws -> Expr {
        let expr = try or()
        if match(.equal) {
            let equals = previous
            let value = try assignment()
            guard let expr = expr as? VariableExpr else {
                throw ParserError(token: equals, message: "Invalid assignment target.")
            }
            return AssignExpr(name: expr.name, value: value)
        } else if let gexpr = expr as? GetExpr {
            let value = try assignment()
            return SetExpr(name: gexpr.name, object: gexpr.object, value: value)
        } else {
            return expr
        }
    }
    
    // logic_or → logic_and ( "or" logic_and )* ;
    func or() throws -> Expr {
        return try logical(and, .or)
    }
    
    // logic_and → equality ( "and" equality )* ;
    func and() throws -> Expr {
        return try logical(equality, .and)
    }
    
    // equality → comparison ( ( "!=" | "==" ) comparison )* ;
    func equality() throws -> Expr {
        return try binary(comparison, .bangEqual, .equalEqual)
    }
    
    // comparison → term ( ( ">" | ">=" | "<" | "<=" ) term )* ;
    func comparison() throws -> Expr {
        return try binary(term, .greater, .greaterEqual, .less, .lessEqual)
    }
    
    // term → factor ( ( "-" | "+" ) factor )* ;
    func term() throws -> Expr {
        return try binary(factor, .minus, .plus)
    }
    
    // factor → unary ( ( "/" | "*" ) unary )* ;
    func factor() throws -> Expr {
        return try binary(unary, .slash, .star)
    }
    
    // unary → ( "!" | "-" ) unary
    //       | call ;
    func unary() throws -> Expr {
        return try unary(unary, call, .bang, .minus)
    }
    
    // call → primary ( "(" arguments? ")" | "." IDENTIFIER )* ;
    func call() throws -> Expr {
        var expr = try primary()
        while true {
            if match(.leftParen) {
                expr = try finishCall(expr)
            } else if match(.dot) {
                let name = try consume(.identifier, message: "Expect property name after '.'.")
                expr = GetExpr(name: name, object: expr)
            } else {
                break
            }
        }
        return expr
    }
    
    // arguments → expression ( "," expression )* ;
    func arguments() throws -> Expr {
        return try binary(expression, .comma)
    }
    
    // primary → NUMBER | STRING | "true" | "false" | "nil"
    //         | "(" expression ")" | IDENTIFIER;
    func primary() throws -> Expr {
        if match(.number, .string) { return LiteralExpr(object: previous.literal) }
        if match(.true) { return LiteralExpr(object: .bool(true)) }
        if match(.false) { return LiteralExpr(object: .bool(false)) }
        if match(.nil) { return LiteralExpr(object: .null) }
        if match(.leftParen) {
            let expr = try expression()
            try consume(.rightParen, message: "Expect ')' after expression.")
            return GroupingExpr(expr: expr)
        }
        if match(.this) { return ThisExpr(keyword: previous) }
        if match(.identifier) { return VariableExpr(name: previous) }
        throw ParserError(token: peek, message: "Expect expression.")
    }
}

// MARK: - Statements grammar
private extension Parser {
    // declaration → classDecl
    //             | funcDecl
    //             | varDecl
    //             | statement ;
    func declaration() -> Stmt? {
        do {
            if match(.class) { return try classDeclaration() }
            if match(.fun) { return try funcDeclaration("function") }
            if match(.var) { return try varDeclaration() }
            return try statement()
        } catch let e as ParserError {
            errorConsumer.error(token: e.token, message: e.message)
            synchronize()
        } catch {
            fatalError(error.localizedDescription)
        }
        return nil
    }
    
    // classDecl → "class" IDENTIFIER "{" function* "}" ;
    func classDeclaration() throws -> Stmt {
        let name = try consume(.identifier, message: "Expect class name.")
        try consume(.leftBrace, message: "Expect '{' before class body.")
        var methods = [FuncStmt]()
        while !check(.rightBrace) && !done {
            methods.append(try funcDeclaration("method"))
        }
        try consume(.rightBrace, message: "Expect '}' before class body.")
        return ClassStmt(name: name, methods: methods)
    }
    
    // funDecl → "fun" function ;
    func funcDeclaration(_ kind: String) throws -> FuncStmt {
        let name = try consume(.identifier, message: "Expect \(kind) name.")
        try consume(.leftParen, message: "Expect '(' after \(kind) name.")
        var params = [Token]()
        if !check(.rightParen) {
            repeat {
                guard params.count <= 255 else {
                    throw ParserError(token: peek, message: "Can't have more than 255 parameters.")
                }
                params.append(try consume(.identifier, message: "Expect parameter name."))
            } while match(.comma)
        }
        try consume(.rightParen, message: "Expect ')' after parameters.")
        try consume(.leftBrace, message: "Expect '{' before \(kind) body.")
        let body = try block()
        return FuncStmt(name: name, params: params, body: body)
    }
    
    // varDecl → "var" IDENTIFIER ( "=" expression )? ";" ;
    func varDeclaration() throws -> Stmt {
        let name = try consume(.identifier, message: "Expect variable name.")
        
        var initializer: Expr? = nil
        if (match(.equal)) {
            initializer = try expression()
        }
        
        try consume(.semicolon, message: "Expect ';' after variable declaration.")
        return VarStmt(name: name, initializer: initializer)
    }
    
    // statement → exprStmt
    //           | forStmt
    //           | ifStmt
    //           | returnStmt
    //           | whileStmt
    //           | block ;
    func statement() throws -> Stmt {
        if match(.for) { return try forStmt() }
        if match(.if) { return try ifStmt() }
        if match(.return) { return try returnStmt() }
        if match(.while) { return try whileStmt() }
        if match(.leftBrace) { return BlockStmt(statements: try block()) }
        return try expressionStmt()
    }
    
    // exprStmt → expression ";" ;
    func expressionStmt() throws -> Stmt {
        let expr = try expression()
        try consume(.semicolon, message: "Expect ';' after statement.")
        return ExpressionStmt(expression: expr)
    }
    
    // forStmt → "for" "(" ( varDecl | exprStmt | ";" )
    //           expression? ";"
    //           expression? ")" statement ;
    func forStmt() throws -> Stmt {
        try consume(.leftParen, message: "Expect '(' after 'for'.")
        let initializer: Stmt?
        if match(.semicolon) { initializer = nil }
        else if match(.var) { initializer = try varDeclaration() }
        else { initializer = try expressionStmt() }
        
        var condition: Expr?
        if !check(.semicolon) {
            condition = try expression()
        }
        try consume(.semicolon, message: "Expect ';' after loop condition")
        
        var increment: Expr?
        if !check(.rightParen) {
            increment = try expression()
        }
        try consume(.rightParen, message: "Expect ')' after for clauses.")
        
        var body = try statement()
        if let increment = increment {
            body = BlockStmt(
                statements: [body, ExpressionStmt(expression: increment)]
            )
        }
        body = WhileStmt(condition: condition ?? LiteralExpr(object: .bool(true)), body: body)
        if let initializer = initializer {
            body = BlockStmt(
                statements: [initializer, body]
            )
        }
        
        return body
    }
    
    // ifStmt → "if" "(" expression ")" statement
    //        ( "else" statement ) ;
    func ifStmt() throws -> Stmt {
        try consume(.leftParen, message: "Expect '(' after 'if'.")
        let condition = try expression()
        try consume(.rightParen, message: "Expect ')' after 'if' condition.")
        let then = try statement()
        var `else`: Stmt?
        if match(.else) {
            `else` = try statement()
        }
        return IfStmt(condition: condition, then: then, else: `else`)
    }
    
    // returnStmt → "return" expression? ";" ;
    func returnStmt() throws -> Stmt {
        var expr: Expr?
        if !check(.semicolon) {
            expr = try expression()
        }
        try consume(.semicolon, message: "Expect ';' after 'return' expression.")
        return ReturnStmt(keyword: previous, value: expr)
    }
    
    // whileStmt → "while" "(" expression ")" statement ;
    func whileStmt() throws -> Stmt {
        try consume(.leftParen, message: "Expect '(' after 'while'.")
        let condition = try expression()
        try consume(.rightParen, message: "Expect ')' after 'while' condition.")
        let body = try statement()
        return WhileStmt(condition: condition, body: body)
    }
    
    // block → "{" declaration* "}" ;
    func block() throws -> [Stmt] {
        var statements = [Stmt]()
        while !check(.rightBrace) && !done {
            if let decl = declaration() {
                statements.append(decl)
            }
        }
        try consume(.rightBrace, message: "Expect '}' after block.")
        return statements
    }
}

// MARK: - Expression Helpers
private extension Parser {
    typealias ExpressionEmitter = () throws -> Expr
    
    func expression() throws -> Expr {
        return try assignment()
    }
    
    // <expression> ( ( <token-1> | <token-2> | ... ) <expression> )* ;
    func logical(_ generator: ExpressionEmitter,
                 _ types: TokenType...) rethrows -> Expr {
        var expr = try generator()
        
        while match(types) {
            let token = previous
            let right = try generator()
            expr = LogicalExpr(
                left: expr,
                op: token,
                right: right
            )
        }
        
        return expr
    }
    
    // <expression> ( ( <token-1> | <token-2> | ... ) <expression> )* ;
    func binary(_ generator: ExpressionEmitter,
                _ types: TokenType...) rethrows -> Expr {
        var expr = try generator()
        
        while match(types) {
            let token = previous
            let right = try generator()
            expr = BinaryExpr(
                left: expr,
                op: token,
                right: right
            )
        }
        
        return expr
    }
    
    // ( <token-1> | <token-2> | ... ) <expression> | <terminal-expression> ;
    func unary(_ generator: ExpressionEmitter,
               _ terminal: ExpressionEmitter,
               _ types: TokenType...) rethrows -> Expr {
        while match(types) {
            let token = previous
            let right = try generator()
            return UnaryExpr(
                op: token,
                right: right
            )
        }
        
        return try terminal()
    }
    
    func finishCall(_ callee: Expr) throws -> Expr {
        var args = [Expr]()
        if !check(.rightParen) {
            repeat {
                guard args.count <= 255 else {
                    throw ParserError(token: peek, message: "Can't have more than 255 arguments.")
                }
                args.append(try expression())
            } while match(.comma)
        }
        let paren = try consume(.rightParen, message: "Expect ')' after arguments.")
        return CallExpr(calee: callee, paren: paren, args: args)
    }
}

// MARK: - Parser helpers
private extension Parser {
    var done: Bool { peek.type == .eof }
    var peek: Token { tokens[current] }
    var previous: Token { tokens[current - 1] }
    
    @discardableResult
    func advance() -> Token {
        if !done { current += 1 }
        return previous
    }
    
    @discardableResult
    func consume(_ type: TokenType, message: String) throws -> Token {
        guard check(type) else { throw ParserError(token: peek, message: message) }
        return advance()
    }
    
    func check(_ type: TokenType) -> Bool {
        guard !done else { return false }
        return peek.type == type
    }
    
    func match(_ types: [TokenType]) -> Bool {
        guard types.first(where: check) != nil else { return false }
        advance()
        return true
    }
    
    func match(_ types: TokenType...) -> Bool {
        return match(types)
    }
    
    func synchronize() {
        advance()
        
        while !done {
            guard previous.type != .semicolon else { break }
            
            switch peek.type {
            case .class, .fun, .var, .for, .if, .while, .return:
                break
            default:
                advance()
            }
        }
    }
}
