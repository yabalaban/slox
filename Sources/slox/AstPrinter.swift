//
//  Created by Alexander Balaban.
//

final class AstPrinter: ExprVisitor {
    typealias ER = String
    
    func print(_ expr: Expr) -> String {
        return try! expr.accept(visitor: self)
    }
    
    func visit(_ expr: AssignExpr) throws -> String {
        return expr.description
    }
    
    func visit(_ expr: BinaryExpr) -> String {
        return parenthesize(name: expr.op.lexeme, exprs: expr.left, expr.right)
    }
    
    func visit(_ expr: CallExpr) throws -> String {
        return "\(try expr.calee.accept(visitor: self))\(expr.paren.lexeme)" + expr.args.reduce("", { "\($0) \(try! $1.accept(visitor: self))" })
    }
    
    func visit(_ expr: GetExpr) throws -> String {
        return expr.description
    }
    
    func visit(_ expr: GroupingExpr) -> String {
        return parenthesize(name: "group", exprs: expr.expr)
    }
    
    func visit(_ expr: LiteralExpr) -> String {
        return expr.description
    }
    
    func visit(_ expr: LogicalExpr) throws -> String {
        return parenthesize(name: expr.op.lexeme, exprs: expr.left, expr.right)
    }
    
    func visit(_ expr: SetExpr) throws -> String {
        return expr.description
    }
    
    func visit(_ expr: ThisExpr) throws -> String {
        return expr.description
    }
    
    func visit(_ expr: UnaryExpr) -> String {
        return parenthesize(name: expr.op.lexeme, exprs: expr.right)
    }
    
    func visit(_ expr: VariableExpr) throws -> String {
        return expr.description
    }
    
    private func parenthesize(name: String, exprs: Expr...) -> String {
        return "(\(name)" + exprs.reduce("", { "\($0) \(try! $1.accept(visitor: self))" }) + ")"
    }
}

