tell application "Terminal"
  activate
  set cmd to "cd /Users/pauloassis/Desktop/appgestaoodonto-main/appgestaoodonto && set -a && source .env.local && set +a && node scripts/security/apply038ClinicLogosEnumerationOnly.mjs > /tmp/security02c_stdout.json 2> /tmp/security02c_stderr.txt; echo EXIT:$? > /tmp/security02c_exit.txt"
  if (count of windows) is 0 then
    do script cmd
  else
    do script cmd in front window
  end if
end tell
