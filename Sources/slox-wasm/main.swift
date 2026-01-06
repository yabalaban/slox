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

// Debug logging helper
func log(_ message: String) {
    let console = JSObject.global.console.object!
    _ = console.log!(JSValue.string("[slox] \(message)"))
}

// Export initialization function for JavaScript to call
@_cdecl("slox_init")
func sloxInit() {
    log("slox_init called")

    // Set up the clock provider to use JavaScript's Date.now()
    clockProvider = {
        let date = JSObject.global.Date.function!.new()
        return date.getTime!().number! / 1000.0
    }
    log("clockProvider set")

    // Create the slox namespace in the global scope
    let sloxNamespace: JSObject = {
        if let existing = JSObject.global.slox.object {
            return existing
        }
        let obj = JSObject.global.Object.function!.new()
        JSObject.global.slox = .object(obj)
        return obj
    }()
    log("namespace created")
    log("build: \(buildTime)")

    // Initialize the interpreter with an output callback
    log("creating initInterpreterClosure...")
    initInterpreterClosure = JSClosure { args -> JSValue in
        log("initInterpreter called with \(args.count) args")
        guard args.count >= 1 else {
            log("initInterpreter: no args")
            return .boolean(false)
        }

        // Try to get function
        guard let cb = args[0].function else {
            log("initInterpreter: arg[0] is not a function")
            return .boolean(false)
        }
        log("initInterpreter: got callback function")

        // Store callback globally to prevent GC
        outputCallback = cb

        driver = Driver { output in
            log("Driver output: \(output)")
            if let cb = outputCallback {
                _ = cb(JSValue.string(output))
            }
        }
        log("initInterpreter: driver created")

        return .boolean(true)
    }
    log("initInterpreterClosure created")

    // Execute a line of Lox code
    executeClosure = JSClosure { args -> JSValue in
        log("execute called")
        guard args.count >= 1 else { return .undefined }
        let source = args[0].string ?? ""
        log("execute: running '\(source)'")
        driver?.run(source: source)
        log("execute: done")
        return .undefined
    }
    log("executeClosure created")

    // Get the current environment state
    getEnvironmentClosure = JSClosure { _ -> JSValue in
        let env = driver?.getEnvironment() ?? "{}"
        return .string(env)
    }
    log("getEnvironmentClosure created")

    // Export functions to the slox namespace
    sloxNamespace.initInterpreter = .object(initInterpreterClosure!)
    sloxNamespace.execute = .object(executeClosure!)
    sloxNamespace.getEnvironment = .object(getEnvironmentClosure!)
    log("functions exported to namespace")

    // Signal that WASM is ready
    if let readyFn = JSObject.global.sloxReady.function {
        _ = readyFn()
    }
    log("slox_init complete")
}
