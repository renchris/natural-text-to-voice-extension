// swift-tools-version: 5.9
// Natural TTS Helper - Native macOS helper for Metal-accelerated TTS
import PackageDescription

let package = Package(
    name: "NaturalTTSHelper",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(
            name: "natural-tts-helper",
            targets: ["NaturalTTSHelper"]
        )
    ],
    // Build floor: a Swift 6.0 toolchain (Xcode 16.2, or its Command Line
    // Tools, on macOS 14.5+). Runtime floor: macOS 14.
    //
    // Every package in the graph, direct AND transitive, is capped at the
    // newest release whose own manifest declares swift-tools-version <= 6.0,
    // because a newer manifest cannot even be parsed by Xcode 16.2 — the last
    // Xcode that runs on Sonoma. Verified 2026-09-23 against each tag's
    // Package.swift on GitHub:
    //   swift-nio          2.97.1 = 6.0 · 2.98.0+ = 6.1
    //   swift-log          1.8.0  = 6.0 · 1.9.0+ = 6.1 · 1.10.1+ = 6.2
    //   swift-collections  1.2.1  = 5.10 · 1.3.0+ = 6.2   (via swift-nio)
    //   swift-system       1.6.6  = 5.9 · 1.7.0+ = 6.1    (via swift-nio)
    //   swift-atomics      1.3.1  = 5.10                   (via swift-nio, no cap needed)
    // Raising any cap raises the build floor: re-check the tag's first line
    //   gh api "repos/apple/<repo>/contents/Package.swift?ref=<tag>" --jq .content | base64 -d | head -1
    // and never commit a Package.resolved that pins past these.
    dependencies: [
        .package(url: "https://github.com/apple/swift-nio.git", .upToNextMinor(from: "2.97.1")),
        .package(url: "https://github.com/apple/swift-log.git", .upToNextMinor(from: "1.8.0")),
        // Transitive caps only; not linked by any target, so SwiftPM prints
        // "dependency ... is not used by any target" for these two. Expected.
        .package(url: "https://github.com/apple/swift-collections.git", "1.1.0"..<"1.3.0"),
        .package(url: "https://github.com/apple/swift-system.git", "1.4.0"..<"1.7.0"),
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
            // Only the worker script ships in the resource bundle. The Python
            // environment lives beside it in the source tree (built there by
            // Scripts/setup-python-env.sh) and is found at runtime relative to
            // the executable (Config.swift, PathResolver); copying the whole
            // Resources directory dragged ~2 GB of venv into every build.
            // The venv and its setup-script rollback copy MUST be excluded: left
            // unclaimed, SwiftPM scans the venv's C sources and fails with "target
            // ... contains mixed language source files". Until they exist it
            // prints "Invalid Exclude ... File not found" for each. Expected.
            exclude: [
                "Resources/python-env",
                "Resources/python-env.pre-1.5",
            ],
            resources: [
                .copy("Resources/tts_worker.py")
            ]
        ),
    ]
)
