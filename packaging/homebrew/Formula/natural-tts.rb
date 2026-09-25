# Natural TTS helper: the local Kokoro-82M engine behind the "Natural TTS: Private Kokoro
# Voices for Mac" Chrome extension. Builds the Swift helper from source, installs the
# uv-locked Python worker environment against Homebrew's python@3.12, and prefetches the
# pinned Kokoro model at install time so the installed helper never touches the network.
#
# This file is the source of truth. packaging/homebrew/publish-tap.sh copies it into the
# renchris/homebrew-tap repository with the real sha256 of the tagged release tarball.
class NaturalTts < Formula
  desc "Local Kokoro-82M text-to-speech helper for the Natural TTS Chrome extension"
  homepage "https://github.com/renchris/natural-text-to-voice-extension"
  url "https://github.com/renchris/natural-text-to-voice-extension/archive/refs/tags/v1.5.1.tar.gz"
  # PLACEHOLDER, not the release checksum: sha256 of
  #   git archive --format=tar.gz --prefix=natural-text-to-voice-extension-1.5.0/ 1d19d62
  # (the tree the local proof in packaging/homebrew/README.md installed for 1.5.0). GitHub's
  # tarball of a tag is not byte-identical to a local git archive, so publish-tap.sh drops
  # this note and writes the sha256 of the downloaded GitHub tarball.
  sha256 "34ec6f52e0b95f69c378c1471e1942eca0d5b6a8f4ebe76e3380592e5a4972b5"
  license "MIT"
  head "https://github.com/renchris/natural-text-to-voice-extension.git", branch: "main"

  depends_on "uv" => :build
  depends_on arch: :arm64
  depends_on "espeak-ng"
  depends_on macos: :sonoma
  depends_on "python@3.12"

  # The Hugging Face cache holding the pinned Kokoro snapshot. Inside the keg, so an
  # uninstall removes it; the opt path keeps it stable across upgrades.
  def hf_home
    opt_libexec/"hf-cache"
  end

  def install
    cd "native-helper" do
      # Homebrew's swift shim exports SDKROOT = its own SDK choice (the Command Line Tools SDK
      # whenever the CLT are installed), but runs /usr/bin/swift, which follows xcode-select and
      # may be a newer Xcode: Swift 6.2 against the CLT's Swift 6.0 SDK fails in swift-nio
      # ("cannot find type 'SendableMetatype'"). Pin SDKROOT to the SDK of the toolchain
      # /usr/bin/swift actually runs, so CLT-only and Xcode machines both build coherently.
      ENV["SDKROOT"] = Utils.safe_popen_read("/usr/bin/xcrun", "--sdk", "macosx", "--show-sdk-path").chomp
      system "swift", "build", "--disable-sandbox", "--configuration", "release"

      # The helper resolves its Python and worker relative to its own (symlink-resolved)
      # executable (Config.swift, PathResolver): <dir>/python-env/bin/python3 and
      # <dir>/tts_worker.py. libexec is that directory.
      libexec.install ".build/release/natural-tts-helper"
      libexec.install "Sources/NaturalTTSHelper/Resources/tts_worker.py"
      (libexec/"python").install "python/pyproject.toml", "python/uv.lock", "python/.python-version"

      # uv sync --frozen: exactly the hash-locked set from uv.lock, into a venv built on
      # Homebrew's python@3.12 (through its opt path, so a 3.12 patch upgrade keeps it
      # working). Never a uv-managed interpreter.
      ENV["UV_PROJECT_ENVIRONMENT"] = (libexec/"python-env").to_s
      ENV["UV_PYTHON"] = (formula_opt_bin("python@3.12")/"python3.12").to_s
      ENV["UV_PYTHON_DOWNLOADS"] = "never"
      ENV["UV_PYTHON_PREFERENCE"] = "only-system"
      ENV["UV_CACHE_DIR"] = (buildpath/"uv-cache").to_s
      ENV["UV_NO_CONFIG"] = "1"
      system "uv", "sync", "--project", libexec/"python", "--frozen", "--compile-bytecode"

      # The worker pins the model to one Hub commit (MODEL_REVISION); fetch exactly that
      # commit and the files the worker loads (MODEL_FILES), as Scripts/setup-python-env.sh does.
      worker = (libexec/"tts_worker.py").read
      revision = worker[/^MODEL_REVISION = "(\h{40})"$/, 1]
      odie "No MODEL_REVISION line in tts_worker.py" if revision.nil?

      ENV["HF_HOME"] = (libexec/"hf-cache").to_s
      ENV["HF_HUB_DISABLE_TELEMETRY"] = "1"
      system libexec/"python-env/bin/python3", "-c",
             "from huggingface_hub import snapshot_download as s; " \
             "s('prince-canuma/Kokoro-82M', revision='#{revision}', " \
             "allow_patterns=['config.json', '*.safetensors'])"
    end

    # The wrapper exec's the real binary, so SIGTERM from launchd reaches it. It pins the
    # interpreter and worker to the version-independent opt paths: left to resolve them, the
    # helper persists Cellar/<version> paths into config.json, which `brew upgrade` deletes,
    # and the service would then fail at start. With these overrides the helper also never
    # reads or writes the shared ~/Library/Application Support/NaturalTTS/config.json that a
    # source checkout uses (Config.swift, LaunchOverrides).
    (bin/"natural-tts-helper").write_env_script libexec/"natural-tts-helper",
      HF_HOME:            hf_home,
      NATURAL_TTS_PYTHON: opt_libexec/"python-env/bin/python3",
      NATURAL_TTS_WORKER: opt_libexec/"tts_worker.py"
  end

  def caveats
    <<~EOS
      Start the helper now and at every login:
        brew services start natural-tts

      Then install the "Natural TTS: Private Kokoro Voices for Mac" extension from the
      Chrome Web Store. It finds the helper on 127.0.0.1, ports 8249-8260.

      The service keeps its config.json in #{var}/natural-tts and logs to
        #{var}/log/natural-tts.log
      The Kokoro model was downloaded at install time; the helper runs offline.
    EOS
  end

  service do
    run [opt_bin/"natural-tts-helper"]
    keep_alive true
    # The wrapper (bin/natural-tts-helper) sets HF_HOME and the interpreter/worker paths.
    environment_variables NATURAL_TTS_CONFIG_DIR: var/"natural-tts"
    log_path var/"log/natural-tts.log"
    error_log_path var/"log/natural-tts.log"
  end

  test do
    require "json"
    require "net/http"

    port = free_port
    base = "http://127.0.0.1:#{port}"
    pid = spawn({ "NATURAL_TTS_CONFIG_DIR" => testpath.to_s },
                bin/"natural-tts-helper", "--port", port.to_s,
                out: (testpath/"helper.log").to_s, err: :out)
    begin
      health = nil
      180.times do
        sleep 1
        begin
          health = JSON.parse(Net::HTTP.get(URI("#{base}/health")))
          break if health["status"] != "warming"
        rescue Errno::ECONNREFUSED, Errno::ECONNRESET, EOFError
          nil
        end
      end
      refute_nil health, "no /health answer on port #{port}:\n#{(testpath/"helper.log").read}"
      assert_equal 2, health["apiVersion"]
      assert_equal "ok", health["status"], (testpath/"helper.log").read

      # One real synthesis, offline, from the prefetched snapshot.
      response = Net::HTTP.post(URI("#{base}/speak"),
                                { text: "Homebrew test.", voice: "af_heart" }.to_json,
                                "Content-Type" => "application/json")
      assert_equal "200", response.code, response.body
      assert_equal "RIFF", response.body[0, 4]
      assert_equal "WAVE", response.body[8, 4]
    ensure
      Process.kill("TERM", pid)
      Process.wait(pid)
    end
  end
end
