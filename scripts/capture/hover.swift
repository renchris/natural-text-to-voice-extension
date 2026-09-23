import CoreGraphics
import Foundation
// Usage: hover <x> <y> <holdSeconds> <captureCmd...>  — moves the real cursor, runs capture, restores cursor.
let a = CommandLine.arguments
let x = Double(a[1])!, y = Double(a[2])!, hold = Double(a[3])!
let orig = CGEvent(source: nil)!.location
func move(_ p: CGPoint) { CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left)!.post(tap: .cghidEventTap) }
move(CGPoint(x: x, y: y)); Thread.sleep(forTimeInterval: hold)
let p = Process(); p.executableURL = URL(fileURLWithPath: "/bin/sh"); p.arguments = ["-c", a[4...].joined(separator: " ")]
try! p.run(); p.waitUntilExit()
move(orig)
print("orig=\(orig) restored")
