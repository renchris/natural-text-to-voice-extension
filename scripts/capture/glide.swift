import CoreGraphics
import Foundation
// Usage: glide <x> <y> <seconds> [--drag]
// Moves the real cursor from where it is to a screen point (points) along an eased path, the way a hand moves a
// mouse, and leaves it there (for takes that record the cursor). With --drag the left button is held for the whole
// path (mouse-down at the start point, dragged events along it, mouse-up at the end): a real drag-select.
// Prints the start point and the mouse-down/up times (epoch ms) so a driver can put them on its timeline.
let a = CommandLine.arguments
guard a.count >= 4, let x = Double(a[1]), let y = Double(a[2]), let secs = Double(a[3]) else {
  fputs("usage: glide <x> <y> <seconds> [--drag]\n", stderr); exit(64)
}
let drag = a.contains("--drag")
let src = CGEventSource(stateID: .hidSystemState)
let from = CGEvent(source: nil)!.location
let to = CGPoint(x: x, y: y)
func post(_ t: CGEventType, _ p: CGPoint) {
  let e = CGEvent(mouseEventSource: src, mouseType: t, mouseCursorPosition: p, mouseButton: .left)!
  if t == .leftMouseDown || t == .leftMouseUp || t == .leftMouseDragged { e.setIntegerValueField(.mouseEventClickState, value: 1) }
  e.post(tap: .cghidEventTap)
}
let now = { Int(Date().timeIntervalSince1970 * 1000) }
var downAt = 0
if drag { post(.leftMouseDown, from); downAt = now(); Thread.sleep(forTimeInterval: 0.08) }
let steps = max(2, Int(secs * 120))
for i in 1...steps {
  let u = Double(i) / Double(steps)
  let k = u < 0.5 ? 4 * u * u * u : 1 - pow(-2 * u + 2, 3) / 2          // ease-in-out cubic
  let p = CGPoint(x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k)
  post(drag ? .leftMouseDragged : .mouseMoved, p)
  Thread.sleep(forTimeInterval: secs / Double(steps))
}
var upAt = 0
if drag { Thread.sleep(forTimeInterval: 0.08); post(.leftMouseUp, to); upAt = now() }
print("from=\(Int(from.x)) \(Int(from.y)) to=\(Int(to.x)) \(Int(to.y)) down_at=\(downAt) up_at=\(upAt) end_at=\(now())")
