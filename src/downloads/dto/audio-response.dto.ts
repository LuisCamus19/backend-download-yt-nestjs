import { StreamableFile } from '@nestjs/common';

export class AudioResponseDto {
  file: StreamableFile | Buffer;

  filename: string;

  constructor(file: StreamableFile | Buffer, filename: string) {
    this.file = file;
    this.filename = filename;
  }
}
