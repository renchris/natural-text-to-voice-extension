import CoreGraphics
import Foundation
// Usage: key <virtualKeyCode>   (53 = Escape)
let k = CGKeyCode(UInt16(CommandLine.arguments[1])!)
CGEvent(keyboardEventSource: nil, virtualKey: k, keyDown: true)!.post(tap: .cghidEventTap)
CGEvent(keyboardEventSource: nil, virtualKey: k, keyDown: false)!.post(tap: .cghidEventTap)
