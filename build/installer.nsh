; Custom NSIS include for DeskMail AI (pulled in via nsis.include in
; electron-builder.yml). Adds one extra, ticked-by-default checkbox to the
; installer's finish page: "Set DeskMail AI as my default email app".
;
; Honest behaviour, on purpose: since Windows 10 no installer can silently make
; an app the default mail client — the OS forces the user to confirm. So the
; mailto ProgID is already registered by electron-builder's `protocols` entry;
; all this checkbox does when ticked is open Windows' own "Default apps" page so
; the user can pick DeskMail there. Leaving it unticked skips that.
;
; These defines are picked up before electron-builder inserts MUI_PAGE_FINISH,
; so they attach a second checkbox alongside the standard "run app" one. Not
; defining *_NOTCHECKED means it starts ticked.

!define MUI_FINISHPAGE_SHOWREADME ""
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Set DeskMail AI as my default email app"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION OpenDefaultAppsSettings

Function OpenDefaultAppsSettings
  ; Open Windows' Default-apps page; the user confirms the change there.
  ExecShell "open" "ms-settings:defaultapps"
FunctionEnd
