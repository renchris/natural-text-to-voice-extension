import CoreGraphics
import Foundation
// Usage: winlist [ownerSubstring]
let filter = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ""
let preflight = CGPreflightScreenCaptureAccess()
print("CGPreflightScreenCaptureAccess=\(preflight)")
let opts: CGWindowListOption = [.optionAll, .excludeDesktopElements]
guard let list = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] else { exit(1) }
for w in list {
  let owner = w[kCGWindowOwnerName as String] as? String ?? ""
  if !filter.isEmpty && !owner.contains(filter) { continue }
  let id = w[kCGWindowNumber as String] as? Int ?? -1
  let name = w[kCGWindowName as String] as? String ?? "<no-name>"
  let layer = w[kCGWindowLayer as String] as? Int ?? -1
  let onscreen = w[kCGWindowIsOnscreen as String] as? Bool ?? false
  let pid = w[kCGWindowOwnerPID as String] as? Int ?? -1
  let b = w[kCGWindowBounds as String] as? [String: Double] ?? [:]
  print("id=\(id) pid=\(pid) layer=\(layer) onscreen=\(onscreen) owner=\(owner) name=\(name) bounds=\(Int(b["X"] ?? 0)),\(Int(b["Y"] ?? 0)) \(Int(b["Width"] ?? 0))x\(Int(b["Height"] ?? 0))")
}
