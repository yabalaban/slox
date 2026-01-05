// swift-tools-version:5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "slox",
    products: [
        .executable(name: "slox", targets: ["slox"]),
        .executable(name: "slox-wasm", targets: ["slox-wasm"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser", from: "1.2.0"),
        .package(url: "https://github.com/swiftwasm/JavaScriptKit", from: "0.19.0"),
    ],
    targets: [
        .target(
            name: "SloxCore",
            dependencies: [],
            path: "Sources/SloxCore"
        ),
        .executableTarget(
            name: "slox",
            dependencies: [
                "SloxCore",
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
            ],
            path: "Sources/slox"
        ),
        .executableTarget(
            name: "slox-wasm",
            dependencies: [
                "SloxCore",
                .product(name: "JavaScriptKit", package: "JavaScriptKit"),
                .product(name: "JavaScriptEventLoop", package: "JavaScriptKit"),
            ],
            path: "Sources/slox-wasm"
        ),
    ]
)
