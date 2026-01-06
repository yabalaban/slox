//
//  Created by Alexander Balaban.
//

import Foundation
import ArgumentParser
import SloxCore

struct Slox: ParsableCommand {
    static var configuration = CommandConfiguration(
        abstract: "s(wift)lox – Lox language interpreter written in Swift"
    )

    @Argument(help: "Path to the Lox file to execute")
    var filepath: String?

    mutating func run() throws {
        let driver = Driver()

        if let filepath = filepath {
            let source = try String(contentsOfFile: filepath, encoding: .utf8)
            driver.run(source: source)
        } else {
            repl(driver: driver)
        }
    }

    private func repl(driver: Driver) {
        print("s(wift)lox repl – lox language interpreter written in Swift.")
        print("Ctrl-C to exit.")
        print(">>> ", terminator: "")

        while let input = readLine() {
            if input == "env" {
                print(driver.getEnvironment())
            } else {
                driver.run(source: input)
            }
            print(">>> ", terminator: "")
        }
    }
}

Slox.main()
