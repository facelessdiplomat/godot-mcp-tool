const toneRate = 22050;
const toneSeconds = 4;
const toneHertz = 440;
const toneAmplitude = 16000;
const waveHeaderBytes = 44;

export function toneWave(): Buffer {
  const samples = toneRate * toneSeconds;
  const wave = Buffer.alloc(waveHeaderBytes + samples * 2);
  wave.write('RIFF', 0, 'ascii');
  wave.writeUInt32LE(wave.length - 8, 4);
  wave.write('WAVEfmt ', 8, 'ascii');
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(toneRate, 24);
  wave.writeUInt32LE(toneRate * 2, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write('data', 36, 'ascii');
  wave.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) {
    wave.writeInt16LE(Math.round(Math.sin((2 * Math.PI * toneHertz * index) / toneRate) * toneAmplitude), waveHeaderBytes + index * 2);
  }
  return wave;
}
