import CoreGraphics
import Foundation
// Usage: move <x> <y>  — moves the real cursor to a screen point (points) and leaves it there. Prints where it was,
// so a driver can park the cursor off the capture window and put it back afterwards.
let a = CommandLine.arguments
let orig = CGEvent(source: nil)!.location
let p = CGPoint(x: Double(a[1])!, y: Double(a[2])!)
CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left)!.post(tap: .cghidEventTap)
print("orig=\(Int(orig.x)) \(Int(orig.y)) moved=\(Int(p.x)) \(Int(p.y)) at=\(Int(Date().timeIntervalSince1970 * 1000))")
