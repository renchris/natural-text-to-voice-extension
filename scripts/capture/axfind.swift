import ApplicationServices
import Foundation
// Usage: axfind <pid> <substring> [role]
// Finds the first element in the app's windows whose title, description or help contains <substring> (optionally
// only of AX role [role], e.g. AXButton) through the Accessibility API, and prints its centre "x y" and frame in
// screen points (the space of click, glide and winlist). Used to find a pinned extension's toolbar button, so a
// take can click it for real instead of calling chrome.action.openPopup(). Exit 1 if there is none.
let a = CommandLine.arguments
guard a.count >= 3, let pid = Int32(a[1]) else { fputs("usage: axfind <pid> <substring> [role]\n", stderr); exit(64) }
let want = a[2], wantRole = a.count > 3 ? a[3] : nil
let app = AXUIElementCreateApplication(pid)
AXUIElementSetMessagingTimeout(app, 2.0)
func attr<T>(_ e: AXUIElement, _ name: String) -> T? {
  var v: CFTypeRef?
  guard AXUIElementCopyAttributeValue(e, name as CFString, &v) == .success else { return nil }
  return v as? T
}
func frame(_ e: AXUIElement) -> CGRect? {
  guard let p: AXValue = attr(e, kAXPositionAttribute), let s: AXValue = attr(e, kAXSizeAttribute) else { return nil }
  var pt = CGPoint.zero, sz = CGSize.zero
  AXValueGetValue(p, .cgPoint, &pt); AXValueGetValue(s, .cgSize, &sz)
  return CGRect(origin: pt, size: sz)
}
var hit: (CGRect, String, String)?
func walk(_ e: AXUIElement, _ depth: Int) {
  if hit != nil || depth > 40 { return }
  let role: String = attr(e, kAXRoleAttribute) ?? ""
  if role == "AXWebArea" { return }   // page content: not the browser's own UI
  let label = [kAXTitleAttribute, kAXDescriptionAttribute, kAXHelpAttribute].compactMap { attr(e, $0) as String? }.joined(separator: " | ")
  if label.contains(want), wantRole == nil || role == wantRole, let f = frame(e), f.width > 0 { hit = (f, role, label); return }
  let kids: [AXUIElement] = attr(e, kAXChildrenAttribute) ?? []
  for k in kids { walk(k, depth + 1) }
}
let wins: [AXUIElement] = attr(app, kAXWindowsAttribute) ?? []
for w in wins { walk(w, 0) }
guard let h = hit else { fputs("no element containing \"\(want)\" in \(wins.count) window(s)\n", stderr); exit(1) }
print("\(Int(h.0.midX)) \(Int(h.0.midY)) \(Int(h.0.minX)) \(Int(h.0.minY)) \(Int(h.0.width)) \(Int(h.0.height))\t\(h.1)\t\(h.2)")
