# winrt-tts.ps1 (ASCII-only on purpose: PS 5.1 misreads non-ASCII .ps1 without BOM)
# Offline TTS via Windows WinRT (OneCore) voices. Reads text from a UTF-8 file.
# Default male voice: Microsoft Zhiwei (zh-TW). Lower rate/pitch => calmer, deeper.
param(
  [Parameter(Mandatory=$true)][string]$TextFile,
  [Parameter(Mandatory=$true)][string]$Out,
  [double]$Rate = 0.85,
  [double]$Pitch = 0.9,
  [string]$VoiceMatch = 'Zhiwei'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

# Await helper: turn WinRT IAsyncOperation into an awaitable Task
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await($op, $type) {
  $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $t.Wait() | Out-Null
  $t.Result
}

[void][Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media, ContentType=WindowsRuntime]
[void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime]

$text = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)

$synth = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::new()
$voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -match $VoiceMatch } | Select-Object -First 1
if ($voice) { $synth.Voice = $voice }
$synth.Options.SpeakingRate = $Rate
$synth.Options.AudioPitch = $Pitch

$stream = Await ($synth.SynthesizeTextToStreamAsync($text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
$size = [uint32]$stream.Size
$reader = [Windows.Storage.Streams.DataReader]::new($stream)
[void](Await ($reader.LoadAsync($size)) ([uint32]))
$bytes = New-Object byte[] $size
$reader.ReadBytes($bytes)

$dir = Split-Path -Parent $Out
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
[System.IO.File]::WriteAllBytes($Out, $bytes)
Write-Output ("OK " + $Out + " " + $bytes.Length + " bytes")
