import XCTest
@testable import SloxCore

final class OutputTests: XCTestCase {

    func testPrintOutputsToHandler() {
        var output: [String] = []
        let driver = Driver { output.append($0) }

        driver.run(source: "print(\"Hello, World!\");")

        XCTAssertEqual(output, ["Hello, World!"])
    }

    func testPrintNumber() {
        var output: [String] = []
        let driver = Driver { output.append($0) }

        driver.run(source: "print(42);")

        XCTAssertEqual(output, ["42"])
    }

    func testPrintExpression() {
        var output: [String] = []
        let driver = Driver { output.append($0) }

        driver.run(source: "print(2 + 3 * 4);")

        XCTAssertEqual(output, ["14"])
    }

    func testMultiplePrints() {
        var output: [String] = []
        let driver = Driver { output.append($0) }

        driver.run(source: """
            print("one");
            print("two");
            print("three");
        """)

        XCTAssertEqual(output, ["one", "two", "three"])
    }

    func testVariableAndPrint() {
        var output: [String] = []
        let driver = Driver { output.append($0) }

        driver.run(source: "var x = 10;")
        driver.run(source: "print(x);")

        XCTAssertEqual(output, ["10"])
    }

    func testFunctionCallPrintsOutput() {
        var output: [String] = []
        let driver = Driver { output.append($0) }

        driver.run(source: """
            fun greet(name) {
                print("Hello, " + name + "!");
            }
        """)
        driver.run(source: "greet(\"Swift\");")

        XCTAssertEqual(output, ["Hello, Swift!"])
    }

    func testPrintNil() {
        var output: [String] = []
        let driver = Driver { output.append($0) }

        driver.run(source: "print(nil);")

        XCTAssertEqual(output, ["nil"])
    }

    func testPrintBoolean() {
        var output: [String] = []
        let driver = Driver { output.append($0) }

        driver.run(source: "print(true);")
        driver.run(source: "print(false);")

        XCTAssertEqual(output, ["true", "false"])
    }

    func testClassMethodPrintsOutput() {
        var output: [String] = []
        let driver = Driver { output.append($0) }

        driver.run(source: """
            class Greeter {
                init(name) { this.name = name; }
                greet() { print("Hi, " + this.name); }
            }
            var g = Greeter("WASM");
            g.greet();
        """)

        XCTAssertEqual(output, ["Hi, WASM"])
    }

    func testFibonacci() {
        var output: [String] = []
        let driver = Driver { output.append($0) }

        driver.run(source: """
            fun fib(n) {
                if (n < 2) return n;
                return fib(n - 1) + fib(n - 2);
            }
            print(fib(10));
        """)

        XCTAssertEqual(output, ["55"])
    }
}
