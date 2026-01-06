//
//  WASM Entry Point for Slox Interpreter
//  Created by Alexander Balaban.
//

import JavaScriptKit
import SloxCore

// Global state
var driver: Driver?

// Export initialization function for JavaScript to call
@_cdecl("slox_init")
func sloxInit() {
    // Set up the clock provider to use JavaScript's Date.now()
    clockProvider = {
        let date = JSObject.global.Date.function!.new()
        return date.getTime!().number! / 1000.0
    }

    // Create the slox namespace in the global scope
    let sloxNamespace: JSObject = {
        if let existing = JSObject.global.slox.object {
            return existing
        }
        let obj = JSObject.global.Object.function!.new()
        JSObject.global.slox = .object(obj)
        return obj
    }()

    // Initialize the interpreter with an output callback
    let initInterpreterClosure = JSClosure { args -> JSValue in
        guard args.count >= 1, let callback = args[0].object else {
            return .undefined
        }

        driver = Driver { output in
            _ = callback.callAsFunction!(JSValue.string(output))
        }

        return .undefined
    }

    // Execute a line of Lox code
    let executeClosure = JSClosure { args -> JSValue in
        guard args.count >= 1 else { return .undefined }
        let source = args[0].string ?? ""
        driver?.run(source: source)
        return .undefined
    }

    // Get the current environment state
    let getEnvironmentClosure = JSClosure { _ -> JSValue in
        let env = driver?.getEnvironment() ?? "{}"
        return .string(env)
    }

    // Export functions to the slox namespace
    sloxNamespace.initInterpreter = JSValue.function(initInterpreterClosure)
    sloxNamespace.execute = JSValue.function(executeClosure)
    sloxNamespace.getEnvironment = JSValue.function(getEnvironmentClosure)

    // Signal that WASM is ready
    if let readyFn = JSObject.global.sloxReady.function {
        _ = readyFn()
    }
}
