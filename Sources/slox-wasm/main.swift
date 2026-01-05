//
//  WASM Entry Point for Slox Interpreter
//  Created by Alexander Balaban.
//

import JavaScriptKit
import JavaScriptEventLoop
import SloxCore

// Initialize the JavaScript event loop for async operations
JavaScriptEventLoop.installGlobalExecutor()

// Set up the clock provider to use JavaScript's Date.now()
clockProvider = {
    let date = JSObject.global.Date.function!.new()
    return date.getTime().number! / 1000.0
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

// Store for our driver instance and output callback
var driver: Driver?
var outputCallback: JSClosure?

// Initialize the interpreter with an output callback
let initInterpreterClosure = JSClosure { args -> JSValue in
    guard args.count >= 1, let callback = args[0].object else {
        return .undefined
    }

    let callbackClosure = JSClosure { [callback] outputArgs -> JSValue in
        if outputArgs.count > 0 {
            _ = callback.callAsFunction(outputArgs[0])
        }
        return .undefined
    }

    driver = Driver { output in
        _ = callbackClosure.callAsFunction(output)
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
sloxNamespace.initInterpreter = .function(initInterpreterClosure)
sloxNamespace.execute = .function(executeClosure)
sloxNamespace.getEnvironment = .function(getEnvironmentClosure)

// Signal that WASM is ready
if let readyFn = JSObject.global.sloxReady.function {
    _ = readyFn()
}

// Keep the runtime alive
RunLoop.main.run()
