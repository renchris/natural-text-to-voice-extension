import ApplicationServices
import Foundation
// Usage: axmenu <pid> [titleSubstring]
// Lists the items of the app's open menu (a native context menu, an open <select> list) through the
// Accessibility API: one line per item, "x y w h<TAB>title" in screen points (top-left origin, the same space
// as winlist, hover and click). With a title substring, prints only the first matching item's centre as "x y"
// and exits 1 if there is none. Needs the Accessibility grant (axcheck).
let a = CommandLine.arguments
guard a.count >= 2, let pid = Int32(a[1]) else { fputs("usage: axmenu <pid> [titleSubstring]\n", stderr); exit(64) }
let want = a.count > 2 ? a[2] : nil
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
var items: [(CGRect, String)] = []
func walk(_ e: AXUIElement, _ depth: Int, _ inMenu: Bool) {
  if depth > 12 { return }
  let role: String = attr(e, kAXRoleAttribute) ?? ""
  let nowInMenu = inMenu || role == "AXMenu"
  if nowInMenu && role == "AXMenuItem", let f = frame(e) {
    let title: String = attr(e, kAXTitleAttribute) ?? ""
    items.append((f, title))
  }
  // Skip the menu bar: its items are the app's main menus, not the open popup.
  if role == "AXMenuBar" { return }
  let kids: [AXUIElement] = attr(e, kAXChildrenAttribute) ?? []
  for k in kids { walk(k, depth + 1, nowInMenu) }
}
walk(app, 0, false)
if let want = want {
  guard let hit = items.first(where: { $0.1.contains(want) }) else { fputs("no menu item containing \"\(want)\" (\(items.count) items)\n", stderr); exit(1) }
  print("\(Int(hit.0.midX)) \(Int(hit.0.midY))")
} else {
  for (f, t) in items { print("\(Int(f.minX)) \(Int(f.minY)) \(Int(f.width)) \(Int(f.height))\t\(t)") }
  if items.isEmpty { fputs("no open menu found\n", stderr); exit(1) }
}
