// swift-tools-version: 5.9
// Natural TTS Helper - Native macOS helper for Metal-accelerated TTS
import PackageDescription

let package = Package(
    name: "NaturalTTSHelper",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "natural-tts-helper",
            targets: ["NaturalTTSHelper"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-nio.git", from: "2.65.0"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.5.0"),
    ],
    targets: [
        .executableTarget(
            name: "NaturalTTSHelper",
            dependencies: [
                .product(name: "NIOCore", package: "swift-nio"),
                .product(name: "NIOPosix", package: "swift-nio"),
                .product(name: "NIOHTTP1", package: "swift-nio"),
                .product(name: "Logging", package: "swift-log"),
            ],
            resources: [
                .copy("Resources")
            ]
        ),
        .testTarget(
            name: "NaturalTTSHelperTests",
            dependencies: ["NaturalTTSHelper"]
        ),
    ]
)
