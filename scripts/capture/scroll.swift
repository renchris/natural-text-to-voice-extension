import CoreGraphics
import Foundation
// Usage: scroll <pixels> <seconds>
// Real scroll-wheel input at the cursor's current position: <pixels> down (negative: up), spread over <seconds> as
// pixel-unit wheel events with an eased profile, the way a trackpad scrolls. The window under the cursor scrolls.
let a = CommandLine.arguments
guard a.count >= 3, let total = Double(a[1]), let secs = Double(a[2]) else { fputs("usage: scroll <pixels> <seconds>\n", stderr); exit(64) }
let steps = max(2, Int(secs * 60))
var done = 0.0
for i in 1...steps {
  let u = Double(i) / Double(steps)
  let k = u < 0.5 ? 2 * u * u : 1 - pow(-2 * u + 2, 2) / 2          // ease-in-out quad
  let want = total * k
  let d = Int32((want - done).rounded())
  if d != 0 {
    CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: -d, wheel2: 0, wheel3: 0)!.post(tap: .cghidEventTap)
    done += Double(d)
  }
  Thread.sleep(forTimeInterval: secs / Double(steps))
}
print("scrolled \(Int(done)) px at=\(Int(Date().timeIntervalSince1970 * 1000))")
