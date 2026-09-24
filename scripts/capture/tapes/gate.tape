# gate.tape — the real fail-closed gate, `bash scripts/verify-all.sh`, run end to end (~3.5 min on an M1 Max).
# Render: scripts/capture/tapes/render.sh gate   (render.sh then removes idle time with retime.mjs)
# The repo is entered through /tmp/natural-tts/repo and TMPDIR is /tmp/natural-tts/tmp, so the gate's own
# "repo …" and "logs …" lines show no username.
Output "/tmp/ntts-w3-out/tapes/gate.gif"

Set Shell bash
Set FontFamily "JetBrainsMono Nerd Font Mono"
Set FontSize 15
Set Width 1280
Set Height 824
Set Padding 28
Set LineHeight 1.25
Set TypingSpeed 40ms
Set Framerate 25
Set CursorBlink false
Set WaitPattern /\$ ?$/
Set Theme {"name":"Natural TTS","background":"#1B2060","foreground":"#F4F5FE","cursor":"#8B97FF","selection":"#3441C6","black":"#11154A","red":"#FF8A9A","green":"#7FE0A6","yellow":"#F5D67B","blue":"#8B97FF","magenta":"#C9A8FF","cyan":"#82D8F2","white":"#F4F5FE","brightBlack":"#9097D0","brightRed":"#FFA3B0","brightGreen":"#A2EBBE","brightYellow":"#F8E29E","brightBlue":"#AAB3FF","brightMagenta":"#D9C2FF","brightCyan":"#A6E4F6","brightWhite":"#FFFFFF"}

Hide
Type "source $TAPE_ENV && cd /tmp/natural-tts/repo && export TMPDIR=/tmp/natural-tts/tmp && mkdir -p $TMPDIR && clear" Enter
Sleep 800ms
Show

Sleep 600ms
Type "bash scripts/verify-all.sh" Sleep 400ms Enter
Wait@600s
Sleep 3s
