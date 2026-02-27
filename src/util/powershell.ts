/**
 * Encode a PowerShell script as a base64 string suitable for -EncodedCommand.
 * PowerShell expects UTF-16LE encoded base64.
 */
export function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}
