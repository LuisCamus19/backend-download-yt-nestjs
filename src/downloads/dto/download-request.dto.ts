import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class DownloadRequestDto {
  @IsNotEmpty({ message: 'La URL no puede estar vacía' })
  @IsUrl({}, { message: 'Debe ser una URL válida de YouTube' })
  url: string;

  @IsString()
  @IsNotEmpty()
  quality: string;

  @IsOptional()
  @IsString()
  format?: 'mp3' | 'mp4';
}
