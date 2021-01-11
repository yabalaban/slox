//
//  Created by Alexander Balaban.
//

import ArgumentParser

struct Slox: ParsableCommand {
    static let driver = Driver()
    @Argument(help: "Path to the Lox file")
    var filepath: String?

    mutating func run() throws {
        if let filepath = filepath {
            try Self.driver.run(filepath: filepath)
        } else {
            Self.driver.repl()
        }
    }
}

Slox.main()
