//
//  WASM Entry Point for Slox Interpreter
//  Created by Alexander Balaban.
//
//  This module provides the WebAssembly interface for the Slox interpreter.
//  It exports a `slox_init` function that sets up the JavaScript API.
//

import JavaScriptKit
import SloxCore

// MARK: - Global State
// These must be kept alive at module scope to prevent garbage collection.
// JavaScriptKit closures are prevent deallocation only while referenced.

/// The Lox interpreter driver instance
var driver: Driver?

/// Callback function to send output to the JavaScript terminal
var outputCallback: JSFunction?

// MARK: - JSClosure References
// JSClosures must be stored globally to prevent deallocation

var initInterpreterClosure: JSClosure?
var executeClosure: JSClosure?
var getEnvironmentClosure: JSClosure?
var getGlobalsClosure: JSClosure?
var resetClosure: JSClosure?

// MARK: - Exported Functions

/// Main initialization function called from JavaScript after WASM loads.
/// Sets up the `window.slox` namespace with interpreter functions.
///
/// Exported as C symbol `slox_init` for direct WASM export.
@_cdecl("slox_init")
func sloxInit() {
    // Configure the clock() built-in to use JavaScript's Date API
    clockProvider = {
        let date = JSObject.global.Date.function!.new()
        return date.getTime!().number! / 1000.0
    }

    // Create or reuse the window.slox namespace object
    let sloxNamespace: JSObject = {
        if let existing = JSObject.global.slox.object {
            return existing
        }
        let obj = JSObject.global.Object.function!.new()
        JSObject.global.slox = .object(obj)
        return obj
    }()

    // slox.initInterpreter(callback) -> bool
    // Initializes the interpreter with an output callback function.
    // Returns true on success, false if callback is invalid.
    initInterpreterClosure = JSClosure { args -> JSValue in
        guard args.count >= 1, let cb = args[0].function else {
            return .boolean(false)
        }
        outputCallback = cb
        driver = Driver { output in
            if let cb = outputCallback {
                _ = cb(JSValue.string(output))
            }
        }
        return .boolean(true)
    }

    // slox.execute(source) -> void
    // Executes Lox source code and sends result to output callback.
    // Uses REPL mode which always outputs the evaluation result.
    executeClosure = JSClosure { args -> JSValue in
        guard args.count >= 1 else { return .undefined }
        let source = args[0].string ?? ""
        if let result = driver?.runRepl(source: source) {
            if let cb = outputCallback {
                _ = cb(JSValue.string(result))
            }
        }
        return .undefined
    }

    // slox.getEnvironment() -> string
    // Returns JSON-like representation of current local scope.
    getEnvironmentClosure = JSClosure { _ -> JSValue in
        return .string(driver?.getEnvironment() ?? "{}")
    }

    // slox.getGlobals() -> string
    // Returns JSON-like representation of global definitions.
    getGlobalsClosure = JSClosure { _ -> JSValue in
        return .string(driver?.getGlobals() ?? "{}")
    }

    // slox.reset() -> void
    // Resets interpreter state, clearing all user-defined variables/functions.
    resetClosure = JSClosure { _ -> JSValue in
        driver?.reset()
        return .undefined
    }

    // Export all functions to window.slox namespace
    sloxNamespace.initInterpreter = .object(initInterpreterClosure!)
    sloxNamespace.execute = .object(executeClosure!)
    sloxNamespace.getEnvironment = .object(getEnvironmentClosure!)
    sloxNamespace.getGlobals = .object(getGlobalsClosure!)
    sloxNamespace.reset = .object(resetClosure!)

    // Signal to JavaScript that WASM initialization is complete
    if let readyFn = JSObject.global.sloxReady.function {
        _ = readyFn()
    }
}
