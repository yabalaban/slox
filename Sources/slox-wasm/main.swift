//
//  WASM Entry Point for Slox Interpreter
//  Created by Alexander Balaban.
//

import JavaScriptKit
import SloxCore

// Global state - must keep references alive
var driver: Driver?
var outputCallback: JSFunction?

// Keep closures alive to prevent GC
var initInterpreterClosure: JSClosure?
var executeClosure: JSClosure?
var getEnvironmentClosure: JSClosure?

// Build timestamp for cache busting verification
let buildTime = "__BUILD_TIME__"

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

    // Export build time
    sloxNamespace.buildTime = JSValue.string(buildTime)

    // Initialize the interpreter with an output callback
    initInterpreterClosure = JSClosure { args -> JSValue in
        guard args.count >= 1, let cb = args[0].function else {
            return .boolean(false)
        }

        // Store callback globally to prevent GC
        outputCallback = cb

        driver = Driver { output in
            if let cb = outputCallback {
                _ = cb(JSValue.string(output))
            }
        }

        return .boolean(true)
    }

    // Execute a line of Lox code
    executeClosure = JSClosure { args -> JSValue in
        guard args.count >= 1 else { return .undefined }
        let source = args[0].string ?? ""
        driver?.run(source: source)
        return .undefined
    }

    // Get the current environment state
    getEnvironmentClosure = JSClosure { _ -> JSValue in
        let env = driver?.getEnvironment() ?? "{}"
        return .string(env)
    }

    // Export functions to the slox namespace
    sloxNamespace.initInterpreter = JSValue.function(initInterpreterClosure!)
    sloxNamespace.execute = JSValue.function(executeClosure!)
    sloxNamespace.getEnvironment = JSValue.function(getEnvironmentClosure!)

    // Signal that WASM is ready
    if let readyFn = JSObject.global.sloxReady.function {
        _ = readyFn()
    }
}
