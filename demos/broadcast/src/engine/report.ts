import type { Analysis } from './meter';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (v: number): string => (Number.isFinite(v) ? v.toFixed(1) : '-inf');

export function loudnessReport(file: string, standard: string, target: number, truePeak: number, input: Analysis, output: Analysis): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<LoudnessReport generator="formencoder">
  <File>${esc(file)}</File>
  <Standard>${esc(standard)}</Standard>
  <TargetLoudness unit="LUFS">${target}</TargetLoudness>
  <MaxTruePeak unit="dBTP">${truePeak}</MaxTruePeak>
  <Input>
    <IntegratedLoudness unit="LUFS">${num(input.integrated)}</IntegratedLoudness>
    <LoudnessRange unit="LU">${num(input.lra)}</LoudnessRange>
    <TruePeak unit="dBTP">${num(input.truePeak)}</TruePeak>
  </Input>
  <Output>
    <IntegratedLoudness unit="LUFS">${num(output.integrated)}</IntegratedLoudness>
    <LoudnessRange unit="LU">${num(output.lra)}</LoudnessRange>
    <TruePeak unit="dBFS">${num(output.truePeak)}</TruePeak>
  </Output>
</LoudnessReport>
`;
}
