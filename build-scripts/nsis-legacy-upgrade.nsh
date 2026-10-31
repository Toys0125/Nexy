; Electron Builder custom install macro.
; The former CefSharp installer used its own HKLM uninstall key and Uninstall.exe,
; rather than Electron Builder's application-ID-based uninstall registration.
; Do not run the old uninstaller after extracting the new files: it would delete
; Nexy's newly installed Electron executable and resources.
!macro customInit
  ; The original x86 NSIS installer wrote to the 32-bit registry view even
  ; though it installed a 64-bit executable. Prefer an existing Electron path
  ; and honor an explicit /D= before adopting the legacy custom directory.
  ReadRegStr $R1 HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  !insertmacro GetDParameter $R2
  ${If} $R1 == ""
  ${AndIf} $R2 == ""
    SetRegView 32
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Nexy" "InstallLocation"
    SetRegView 64
    ${If} $R0 == ""
      ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Nexy" "InstallLocation"
    ${EndIf}
    ${If} $R0 != ""
    ${AndIf} ${FileExists} "$R0\Nexy.exe"
      StrCpy $INSTDIR $R0
    ${EndIf}
  ${EndIf}
!macroend

!macro removeLegacyRegistration REG_VIEW
  SetRegView ${REG_VIEW}
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Nexy" "InstallLocation"
  ${If} $R0 != ""
    GetFullPathName $R0 "$R0"
  ${EndIf}
  ${If} $R0 == "$INSTDIR"
    DetailPrint "Removing legacy CefSharp installer registration and binaries"
    Delete "$INSTDIR\Uninstall.exe"
    Delete "$INSTDIR\CefSharp*.dll"
    Delete "$INSTDIR\libcef.dll"
    Delete "$INSTDIR\chrome_elf.dll"
    Delete "$INSTDIR\CefSharp.BrowserSubprocess.exe"
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Nexy"
    DeleteRegKey HKLM "Software\Nexy"
    ; Legacy shortcuts were created in the installing user's shell folders.
    ; Refresh existing ones as well as Electron Builder's all-user shortcuts.
    SetShellVarContext current
    ${If} ${FileExists} "$DESKTOP\Nexy.lnk"
      CreateShortCut "$DESKTOP\Nexy.lnk" "$INSTDIR\Nexy.exe"
      WinShell::SetLnkAUMI "$DESKTOP\Nexy.lnk" "${APP_ID}"
    ${EndIf}
    ${If} ${FileExists} "$SMPROGRAMS\Nexy.lnk"
      CreateShortCut "$SMPROGRAMS\Nexy.lnk" "$INSTDIR\Nexy.exe"
      WinShell::SetLnkAUMI "$SMPROGRAMS\Nexy.lnk" "${APP_ID}"
    ${EndIf}
    SetShellVarContext all
  ${EndIf}
!macroend

; The top-level protocols option does not generate NSIS registry entries.
; Register during installation so silent installs work before the first launch.
!macro registerNexyProtocol ROOT KEY
  WriteRegStr ${ROOT} "${KEY}" "" "URL:Nexy Protocol"
  WriteRegStr ${ROOT} "${KEY}" "URL Protocol" ""
  WriteRegStr ${ROOT} "${KEY}\DefaultIcon" "" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\",0'
  WriteRegStr ${ROOT} "${KEY}\shell\open\command" "" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%1$\"'
!macroend

!macro unregisterNexyProtocol ROOT KEY
  ReadRegStr $R0 ${ROOT} "${KEY}\shell\open\command" ""
  ; Leave a handler belonging to another installation intact.
  ${If} $R0 == '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%1$\"'
    DeleteRegKey ${ROOT} "${KEY}"
  ${EndIf}
!macroend

!macro customInstall
  !insertmacro removeLegacyRegistration 32
  !insertmacro removeLegacyRegistration 64
  SetRegView 64
  !insertmacro registerNexyProtocol SHELL_CONTEXT "Software\Classes\nexy"
!macroend

!macro customUnInstall
  SetRegView 64
  !insertmacro unregisterNexyProtocol SHELL_CONTEXT "Software\Classes\nexy"
!macroend
