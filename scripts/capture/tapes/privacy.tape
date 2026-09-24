# privacy.tape — the running capture helper's sockets: the Kokoro worker has none, the helper listens on localhost.
# Render: scripts/capture/tapes/render.sh privacy <out-dir> (the capture helper must be running on 127.0.0.1:8251, the GUI
# pass port; the file is written to <out-dir>/privacy.mp4, relative to where vhs runs). 1920x1080 for the promo video's privacy scene. Nothing is simulated: the pids are
# looked up on camera. awk drops lsof's USER, FD, DEVICE and SIZE columns so no username is on screen.
Output "privacy.mp4"

Set Shell bash
Set FontFamily "JetBrainsMono Nerd Font Mono"
Set FontSize 34
Set Width 1920
Set Height 1080
Set Padding 90
Set LineHeight 1.35
Set TypingSpeed 9ms
Set Framerate 30
Set CursorBlink false
Set WaitPattern /\$ ?$/
Set Theme {"name":"Natural TTS","background":"#1B2060","foreground":"#F4F5FE","cursor":"#8B97FF","selection":"#3441C6","black":"#11154A","red":"#FF8A9A","green":"#7FE0A6","yellow":"#F5D67B","blue":"#8B97FF","magenta":"#C9A8FF","cyan":"#82D8F2","white":"#F4F5FE","brightBlack":"#9097D0","brightRed":"#FFA3B0","brightGreen":"#A2EBBE","brightYellow":"#F8E29E","brightBlue":"#AAB3FF","brightMagenta":"#D9C2FF","brightCyan":"#A6E4F6","brightWhite":"#FFFFFF"}

Hide
Type "source $TAPE_ENV; clear" Enter
Sleep 500ms
Show

Sleep 400ms
Type "HELPER=$(lsof -t -iTCP:8251 -sTCP:LISTEN) WORKER=$(pgrep -P $HELPER)" Enter
Sleep 300ms
Type "ps -o pid=,ucomm= -p $HELPER,$WORKER" Enter
Sleep 900ms
Type "# the Kokoro worker: how many network sockets?" Enter
Type "lsof -nP -a -p $WORKER -i | wc -l | tr -d ' '" Enter
Sleep 1100ms
Type "# the helper: listening on this Mac only" Enter
Type "lsof -nP -a -p $HELPER -i | awk '{print $1, $2, $8, $9, $10}'" Enter
Sleep 3000ms
