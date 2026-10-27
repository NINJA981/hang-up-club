# Windows SAPI batch renderer (ADR §4.1). Always available on Windows.
# Usage: powershell -NoProfile -File sapi.ps1 -JobsFile jobs.json
# jobs.json: [{ "voice": "Microsoft Zira Desktop", "rate": 0, "text": "...", "out": "x.wav" }]
param([Parameter(Mandatory = $true)][string]$JobsFile)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$jobs = Get-Content -Raw -Encoding UTF8 -Path $JobsFile | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
  22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$currentVoice = ''
foreach ($job in $jobs) {
  if ($job.voice -ne $currentVoice) {
    $synth.SelectVoice($job.voice)
    $currentVoice = $job.voice
  }
  $synth.Rate = [int]$job.rate
  $synth.SetOutputToWaveFile($job.out, $format)
  $synth.Speak($job.text)
  $synth.SetOutputToNull()
}
$synth.Dispose()
