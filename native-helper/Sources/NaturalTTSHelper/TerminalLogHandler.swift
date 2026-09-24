import Foundation
import Logging

/// The helper's log handler when stdout is a terminal: one line per message, with no timestamp, level or label for
/// info and notice (a person watching the helper start needs the messages, not the log format), and a
/// "warning:" / "error:" style prefix from `.warning` up. Output is flushed per line.
struct TerminalLogHandler: LogHandler {
    var logLevel: Logger.Level = .info
    var metadata: Logger.Metadata = [:]

    subscript(metadataKey key: String) -> Logger.Metadata.Value? {
        get { metadata[key] }
        set { metadata[key] = newValue }
    }

    func log(
        level: Logger.Level,
        message: Logger.Message,
        metadata: Logger.Metadata?,
        source: String,
        file: String,
        function: String,
        line: UInt
    ) {
        let prefix = level >= .warning ? "\(level): " : ""
        let text = "\(prefix)\(message)\n"
        FileHandle.standardOutput.write(Data(text.utf8))
    }
}
