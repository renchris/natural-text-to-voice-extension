import ScreenCaptureKit
@main struct M { static func main() async throws {
  let c = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
  for a in c.applications where a.bundleIdentifier.lowercased().contains("chrome") { print(a.processID, a.bundleIdentifier, a.applicationName) }
}}
