import CoreGraphics
import Foundation
// Usage: click <x> <y> [hoverSeconds] [--right] [--stay]
// One real OS click at a screen point (points): left by default, --right for a secondary click (Chrome opens its
// native context menu on it). The cursor is restored to where it was afterwards, unless --stay (for takes that
// record the cursor, where a jump back would show). Prints the mouse-down time (down_at=, epoch ms).
let a = CommandLine.arguments
let flags = a.filter { $0.hasPrefix("--") }
let pos = a.filter { !$0.hasPrefix("--") }
let p = CGPoint(x: Double(pos[1])!, y: Double(pos[2])!)
let hover = pos.count > 3 ? Double(pos[3])! : 0.4
let right = flags.contains("--right"), stay = flags.contains("--stay")
let orig = CGEvent(source: nil)!.location
func post(_ t: CGEventType, _ at: CGPoint) {
  let e = CGEvent(mouseEventSource: CGEventSource(stateID: .hidSystemState), mouseType: t, mouseCursorPosition: at,
                  mouseButton: right ? .right : .left)!
  if [.leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp].contains(t) { e.setIntegerValueField(.mouseEventClickState, value: 1) }
  e.post(tap: .cghidEventTap)
}
post(.mouseMoved, p); Thread.sleep(forTimeInterval: hover)
let downAt = Int(Date().timeIntervalSince1970 * 1000)
post(right ? .rightMouseDown : .leftMouseDown, p); Thread.sleep(forTimeInterval: 0.06); post(right ? .rightMouseUp : .leftMouseUp, p)
if !stay { Thread.sleep(forTimeInterval: 0.2); post(.mouseMoved, orig) }
print("clicked \(p)\(right ? " (right)" : ""), cursor \(stay ? "left there" : "restored to \(orig)") down_at=\(downAt)")
