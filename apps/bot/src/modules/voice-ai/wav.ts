export function pcmToWav(pcm: Buffer, sampleRate: number, channels = 1): Buffer {
  const numChannels = channels;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample >> 3);
  const blockAlign = numChannels * (bitsPerSample >> 3);
  const dataSize = pcm.byteLength;
  const headerSize = 44;
  const buf = Buffer.alloc(headerSize + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(headerSize + dataSize - 8, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  pcm.copy(buf, 44);
  return buf;
}
