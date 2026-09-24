import CoreGraphics
import Foundation
// Usage: click <x> <y> [hoverSeconds]  — real OS left click at screen point (points), then restores the cursor.
let a = CommandLine.arguments
let p = CGPoint(x: Double(a[1])!, y: Double(a[2])!)
let hover = a.count > 3 ? Double(a[3])! : 0.4
let orig = CGEvent(source: nil)!.location
func post(_ t: CGEventType, _ at: CGPoint) {
  let e = CGEvent(mouseEventSource: CGEventSource(stateID: .hidSystemState), mouseType: t, mouseCursorPosition: at, mouseButton: .left)!
  if t == .leftMouseDown || t == .leftMouseUp { e.setIntegerValueField(.mouseEventClickState, value: 1) }
  e.post(tap: .cghidEventTap)
}
post(.mouseMoved, p); Thread.sleep(forTimeInterval: hover)
let downAt = Int(Date().timeIntervalSince1970 * 1000)
post(.leftMouseDown, p); Thread.sleep(forTimeInterval: 0.06); post(.leftMouseUp, p)
Thread.sleep(forTimeInterval: 0.2); post(.mouseMoved, orig)
print("clicked \(p), cursor restored to \(orig) down_at=\(downAt)")
