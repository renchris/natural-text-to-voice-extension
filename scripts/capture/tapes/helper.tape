# helper.tape — the real Natural TTS helper starting, answering /health, and writing a WAV from /speak.
# Render: scripts/capture/tapes/render.sh helper   (needs vhs 0.11, jq, gif2webp, and a free port 8250)
Output "/tmp/ntts-w3-out/tapes/helper.gif"

Set Shell bash
Set FontFamily "JetBrainsMono Nerd Font Mono"
Set FontSize 18
Set Width 1182
Set Height 870
Set Padding 28
Set LineHeight 1.25
Set TypingSpeed 35ms
Set Framerate 25
Set CursorBlink false
Set WaitPattern /\$ ?$/
Set Theme {"name":"Natural TTS","background":"#1B2060","foreground":"#F4F5FE","cursor":"#8B97FF","selection":"#3441C6","black":"#11154A","red":"#FF8A9A","green":"#7FE0A6","yellow":"#F5D67B","blue":"#8B97FF","magenta":"#C9A8FF","cyan":"#82D8F2","white":"#F4F5FE","brightBlack":"#9097D0","brightRed":"#FFA3B0","brightGreen":"#A2EBBE","brightYellow":"#F8E29E","brightBlue":"#AAB3FF","brightMagenta":"#D9C2FF","brightCyan":"#A6E4F6","brightWhite":"#FFFFFF"}

Hide
Type "source $TAPE_ENV" Enter
Sleep 500ms
Show

Sleep 600ms
Type `natural-tts-helper --port 8250 2>&1 | sed 's/.*Helper\] //'` Sleep 300ms Enter
Wait+Screen@90s /Helper is ready!/
Sleep 2s
# Off camera: move the running helper to the background (Ctrl+Z, bg) and clear the screen for the requests.
Hide
Ctrl+Z
Sleep 300ms
Type "bg; clear" Enter
Sleep 500ms
Show
Type "curl -s localhost:8250/health | jq ." Sleep 300ms Enter
Sleep 2.5s
Type `curl -s localhost:8250/speak -H 'Content-Type: application/json' \` Enter
Type `-d '{"text":"Hello from a private Kokoro voice.","voice":"af_heart"}' -o hello.wav` Sleep 300ms Enter
Wait@30s
Type `afinfo hello.wav | grep -E 'Data format|estimated duration'` Sleep 300ms Enter
Sleep 3.5s

Hide
Type "kill %1; wait" Enter
Sleep 1s
