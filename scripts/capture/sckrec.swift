// sckrec — ScreenCaptureKit recorder scoped to ONE app's windows + that app's audio.
// Usage: sckrec <pid> <seconds> <out.mov> [x y w h (points, display coords)] [--no-cursor] [--exclude-others]
//              [--any-space]
//   default        : inclusion filter on the app with <pid> (clean picture; Chrome audio records as SILENCE)
//   --exclude-others: display filter excluding every app whose bundle id differs (keeps Chrome audio)
//   --any-space    : also find an app whose windows are on another Space (audio-only captures)
// Requires macOS 15 (SCRecordingOutput) and Screen Recording permission for the calling terminal.
import AVFoundation
import CoreMedia
import Foundation
import ScreenCaptureKit

final class Sink: NSObject, SCStreamOutput, SCStreamDelegate, SCRecordingOutputDelegate {
  var videoFrames = 0, audioBuffers = 0
  func stream(_ s: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
    if type == .screen { videoFrames += 1 } else if type == .audio { audioBuffers += 1 }
  }
  func stream(_ s: SCStream, didStopWithError e: Error) { fputs("stream stopped with error: \(e)\n", stderr) }
  func recordingOutputDidStartRecording(_ r: SCRecordingOutput) { print("recording started at=\(Int(Date().timeIntervalSince1970 * 1000))"); fflush(stdout) }
  func recordingOutputDidFinishRecording(_ r: SCRecordingOutput) { print("recording finished") }
  func recordingOutput(_ r: SCRecordingOutput, didFailWithError e: Error) { fputs("recording failed: \(e)\n", stderr) }
}

@main struct Main {
  static func main() async throws {
    let a = CommandLine.arguments
    guard a.count >= 4, let pid = Int32(a[1]), let secs = Double(a[2]) else {
      fputs("usage: sckrec <pid> <seconds> <out.mov> [x y w h] [--no-cursor] [--exclude-others] [--any-space]\n", stderr); exit(64)
    }
    let out = URL(fileURLWithPath: a[3])
    try? FileManager.default.removeItem(at: out)
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: !a.contains("--any-space"))
    guard let app = content.applications.first(where: { $0.processID == pid }) else {
      fputs("no shareable app with pid \(pid)\n", stderr); exit(2)
    }
    let display = content.displays.first!
    let exclusionMode = a.contains("--exclude-others")
    let others = content.applications.filter { $0.bundleIdentifier != app.bundleIdentifier }
    // --exclude-others: display filter that EXCLUDES every other app. Audio produced by processes that are
    // not shareable apps (e.g. Chrome's audio-service helper) is then kept, which an inclusion filter drops.
    let filter = exclusionMode
      ? SCContentFilter(display: display, excludingApplications: others, exceptingWindows: [])
      : SCContentFilter(display: display, including: [app], exceptingWindows: [])
    print("mode=\(exclusionMode ? "exclude-others(\(others.count) apps)" : "include-app")")
    let scale = Int(filter.pointPixelScale)
    let cfg = SCStreamConfiguration()
    var rect = CGRect(x: 0, y: 0, width: display.width, height: display.height)
    if a.count >= 8, let x = Double(a[4]), let y = Double(a[5]), let w = Double(a[6]), let h = Double(a[7]) {
      rect = CGRect(x: x, y: y, width: w, height: h)
      cfg.sourceRect = rect
    }
    cfg.width = Int(rect.width) * scale
    cfg.height = Int(rect.height) * scale
    cfg.minimumFrameInterval = CMTime(value: 1, timescale: 60)
    cfg.showsCursor = !a.contains("--no-cursor")
    cfg.capturesAudio = true
    cfg.sampleRate = 48_000
    cfg.channelCount = 2
    cfg.excludesCurrentProcessAudio = true
    cfg.colorSpaceName = CGColorSpace.sRGB  // tag/convert to sRGB so encoders & web players agree

    let sink = Sink()
    let stream = SCStream(filter: filter, configuration: cfg, delegate: sink)
    try stream.addStreamOutput(sink, type: .screen, sampleHandlerQueue: .global())
    try stream.addStreamOutput(sink, type: .audio, sampleHandlerQueue: .global())
    let rc = SCRecordingOutputConfiguration()
    rc.outputURL = out
    rc.outputFileType = .mov
    rc.videoCodecType = .h264
    let rec = SCRecordingOutput(configuration: rc, delegate: sink)
    try stream.addRecordingOutput(rec)
    try await stream.startCapture()
    fflush(stdout); print("capturing app=\(app.applicationName) pid=\(pid) rect=\(rect) scale=\(scale) px=\(cfg.width)x\(cfg.height) for \(secs)s"); fflush(stdout)
    try await Task.sleep(nanoseconds: UInt64(secs * 1_000_000_000))
    try await stream.stopCapture()
    try await Task.sleep(nanoseconds: 700_000_000)
    print("videoFrames=\(sink.videoFrames) audioBuffers=\(sink.audioBuffers) -> \(out.path)")
  }
}
