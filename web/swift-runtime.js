// JavaScriptKit Swift Runtime for Browser
// Provides the JavaScript-side runtime for Swift WASM interop

export class SwiftRuntime {
    constructor() {
        this.instance = null;
        this.memory = null;
        this.heap = [];
        this.heapNextIndex = 0;
        
        // Reserve first slots for special values
        this.heap.push(undefined);  // 0
        this.heap.push(null);       // 1
        this.heap.push(true);       // 2
        this.heap.push(false);      // 3
        this.heap.push(globalThis); // 4
        this.heapNextIndex = 5;
    }
    
    get wasmImports() {
        return {
            swjs_set_prop: (ref, name, kind, payload1, payload2) => {
                const obj = this.getObject(ref);
                const key = this.getObject(name);
                const value = this.decodeValue(kind, payload1, payload2);
                obj[key] = value;
            },
            swjs_get_prop: (ref, name, payload1, payload2) => {
                const obj = this.getObject(ref);
                const key = this.getObject(name);
                const value = obj[key];
                return this.encodeValue(value, payload1, payload2);
            },
            swjs_set_subscript: (ref, index, kind, payload1, payload2) => {
                const obj = this.getObject(ref);
                const value = this.decodeValue(kind, payload1, payload2);
                obj[index] = value;
            },
            swjs_get_subscript: (ref, index, payload1, payload2) => {
                const obj = this.getObject(ref);
                const value = obj[index];
                return this.encodeValue(value, payload1, payload2);
            },
            swjs_encode_string: (ref, bytes) => {
                const str = this.getObject(ref);
                const encoder = new TextEncoder();
                const encoded = encoder.encode(str);
                const ptr = this.instance.exports.swjs_prepare_host_function_call(encoded.length);
                new Uint8Array(this.memory.buffer, ptr, encoded.length).set(encoded);
                return encoded.length;
            },
            swjs_decode_string: (bytes, length) => {
                const str = this.loadStringFromPtr(bytes, length);
                return this.retain(str);
            },
            swjs_load_string: (ref, buffer) => {
                const str = this.getObject(ref);
                const encoder = new TextEncoder();
                const encoded = encoder.encode(str);
                new Uint8Array(this.memory.buffer, buffer, encoded.length).set(encoded);
            },
            swjs_call_function: (ref, argv, argc, payload1, payload2) => {
                const func = this.getObject(ref);
                const args = this.decodeArgs(argv, argc);
                try {
                    const result = func(...args);
                    return this.encodeValue(result, payload1, payload2);
                } catch (error) {
                    return this.encodeValue(error, payload1, payload2);
                }
            },
            swjs_call_function_with_this: (objRef, funcRef, argv, argc, payload1, payload2) => {
                const obj = this.getObject(objRef);
                const func = this.getObject(funcRef);
                const args = this.decodeArgs(argv, argc);
                try {
                    const result = func.apply(obj, args);
                    return this.encodeValue(result, payload1, payload2);
                } catch (error) {
                    return this.encodeValue(error, payload1, payload2);
                }
            },
            swjs_call_function_no_catch: (ref, argv, argc, payload1, payload2) => {
                const func = this.getObject(ref);
                const args = this.decodeArgs(argv, argc);
                const result = func(...args);
                return this.encodeValue(result, payload1, payload2);
            },
            swjs_call_function_with_this_no_catch: (objRef, funcRef, argv, argc, payload1, payload2) => {
                const obj = this.getObject(objRef);
                const func = this.getObject(funcRef);
                const args = this.decodeArgs(argv, argc);
                const result = func.apply(obj, args);
                return this.encodeValue(result, payload1, payload2);
            },
            swjs_call_new: (ref, argv, argc) => {
                const constructor = this.getObject(ref);
                const args = this.decodeArgs(argv, argc);
                const instance = new constructor(...args);
                return this.retain(instance);
            },
            swjs_call_throwing_new: (ref, argv, argc, exceptionPayload1, exceptionPayload2) => {
                const constructor = this.getObject(ref);
                const args = this.decodeArgs(argv, argc);
                try {
                    const instance = new constructor(...args);
                    return this.retain(instance);
                } catch (error) {
                    this.encodeValue(error, exceptionPayload1, exceptionPayload2);
                    return -1;
                }
            },
            swjs_instanceof: (ref, constructorRef) => {
                const obj = this.getObject(ref);
                const constructor = this.getObject(constructorRef);
                return obj instanceof constructor;
            },
            swjs_create_function: (hostFuncRef, line, file) => {
                const self = this;
                const func = function(...args) {
                    return self.callHostFunction(hostFuncRef, args);
                };
                return this.retain(func);
            },
            swjs_create_typed_array: (constructor, elementsPtr, length) => {
                const TypedArray = this.getObject(constructor);
                const buffer = new TypedArray(this.memory.buffer, elementsPtr, length);
                const copy = new TypedArray(buffer);
                return this.retain(copy);
            },
            swjs_load_typed_array: (ref, buffer) => {
                const typedArray = this.getObject(ref);
                const uint8View = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
                new Uint8Array(this.memory.buffer, buffer, typedArray.byteLength).set(uint8View);
                return typedArray.byteLength;
            },
            swjs_release: (ref) => {
                this.release(ref);
            },
            swjs_i64_to_bigint: (value, signed) => {
                return this.retain(signed ? BigInt.asIntN(64, value) : BigInt.asUintN(64, value));
            },
            swjs_bigint_to_i64: (ref, signed) => {
                const bigint = this.getObject(ref);
                return BigInt.asIntN(64, bigint);
            },
            swjs_i64_to_bigint_slow: (lower, upper, signed) => {
                const value = BigInt(lower) | (BigInt(upper) << 32n);
                return this.retain(signed ? BigInt.asIntN(64, value) : value);
            },
            swjs_unsafe_event_loop_yield: () => {
                // No-op in browser
            }
        };
    }
    
    setInstance(instance) {
        this.instance = instance;
        this.memory = instance.exports.memory;
    }
    
    retain(value) {
        const index = this.heapNextIndex;
        this.heap[index] = value;
        this.heapNextIndex++;
        return index;
    }
    
    release(ref) {
        this.heap[ref] = undefined;
    }
    
    getObject(ref) {
        return this.heap[ref];
    }
    
    loadString(ptr) {
        const memory = new Uint8Array(this.memory.buffer);
        let end = ptr;
        while (memory[end] !== 0) end++;
        return new TextDecoder().decode(memory.slice(ptr, end));
    }
    
    loadStringFromPtr(ptr, length) {
        const memory = new Uint8Array(this.memory.buffer, ptr, length);
        return new TextDecoder().decode(memory);
    }
    
    decodeValue(kind, payload1, payload2) {
        switch (kind) {
            case 0: return false;
            case 1: return true;
            case 2: return null;
            case 3: return undefined;
            case 4: return payload1; // i32
            case 5: return this.instance.exports.swjs_library_features?.() || 0;
            case 6: return this.getObject(payload1); // object ref
            case 7: return this.getObject(payload1); // function ref
            case 8: return this.loadStringFromPtr(payload1, payload2); // string
            default: return undefined;
        }
    }
    
    encodeValue(value, payload1Ptr, payload2Ptr) {
        const view = new DataView(this.memory.buffer);
        
        if (value === false) {
            return 0;
        } else if (value === true) {
            return 1;
        } else if (value === null) {
            return 2;
        } else if (value === undefined) {
            return 3;
        } else if (typeof value === 'number') {
            view.setFloat64(payload1Ptr, value, true);
            return 4;
        } else if (typeof value === 'string') {
            const ref = this.retain(value);
            view.setUint32(payload1Ptr, ref, true);
            return 5;
        } else if (typeof value === 'bigint') {
            const ref = this.retain(value);
            view.setUint32(payload1Ptr, ref, true);
            return 9;
        } else if (typeof value === 'object' || typeof value === 'function') {
            const ref = this.retain(value);
            view.setUint32(payload1Ptr, ref, true);
            return typeof value === 'function' ? 7 : 6;
        }
        return 3; // undefined
    }
    
    decodeArgs(argv, argc) {
        const args = [];
        const view = new DataView(this.memory.buffer);
        for (let i = 0; i < argc; i++) {
            const base = argv + i * 16;
            const kind = view.getUint32(base, true);
            const payload1 = view.getUint32(base + 4, true);
            const payload2 = view.getUint32(base + 8, true);
            args.push(this.decodeValue(kind, payload1, payload2));
        }
        return args;
    }
    
    callHostFunction(hostFuncRef, args) {
        // This would need to call back into Swift
        // For now, return undefined
        return undefined;
    }
}
