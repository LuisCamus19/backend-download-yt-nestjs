import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { DownloadRequestDto } from './dto/download-request.dto';
import { AudioResponseDto } from './dto/audio-response.dto';
import { StreamableFile } from '@nestjs/common';

@Injectable()
export class DownloadsService {
  private readonly logger = new Logger(DownloadsService.name);
  private ytDlpCommand = 'yt-dlp'; // Asegúrate de que yt-dlp esté en el PATH de Windows

  // Un User-Agent genérico ayuda a que no te bloqueen inmediatamente
  private readonly userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  async downloadAudio(request: DownloadRequestDto): Promise<AudioResponseDto> {
    return this.ejecutarDescarga(request.url, request.quality, 'mp3');
  }

  async downloadVideo(request: DownloadRequestDto): Promise<AudioResponseDto> {
    const resolution = request.quality || '1080';
    return this.ejecutarDescarga(request.url, resolution, 'mp4');
  }

  private async ejecutarDescarga(
    videoUrl: string,
    qualityParam: string,
    format: string,
  ): Promise<AudioResponseDto> {
    this.logger.log(`--- NUEVA SOLICITUD --- URL: ${videoUrl}`);

    // 1. OBTENER TÍTULO (Sin cookies, modo simple)
    let videoTitle = 'archivo_descargado';
    try {
      videoTitle = await this.getVideoTitle(videoUrl);
    } catch (e) {
      this.logger.warn('⚠️ No se pudo obtener título, usando genérico.');
    }

    // Limpieza de caracteres prohibidos en Windows
    videoTitle = videoTitle.replace(/[\\/:*?"<>|]/g, '_');
    this.logger.log(`Título: ${videoTitle}`);

    const processId = uuidv4();
    const uniqueFileName = `temp_${processId}.${format}`;
    // Usamos la carpeta temporal del sistema
    const tempFilePath = path.join(os.tmpdir(), uniqueFileName);

    const args: string[] = [];

    // --- CONFIGURACIÓN BÁSICA ---
    args.push('--user-agent', this.userAgent);
    args.push('--no-playlist');
    args.push('-o', tempFilePath);
    args.push('--force-overwrites');
    args.push('--no-warnings');

    // --- CONFIGURACIÓN DE FORMATOS ---
    if (format === 'mp3') {
      const bitrate = qualityParam ? `${qualityParam}K` : '192K';
      args.push('-x'); // Extraer audio
      args.push('--audio-format', 'mp3');
      args.push('--audio-quality', bitrate);
      args.push('--add-metadata');
    } else {
      const res = qualityParam || '1080';
      // Descargar mejor video + mejor audio y unir
      args.push(
        '-f',
        `bestvideo[height<=${res}]+bestaudio/best[height<=${res}]`,
      );
      args.push('--merge-output-format', 'mp4');
    }

    args.push(videoUrl);

    // 2. EJECUCIÓN DEL COMANDO
    await this.runSpawn(this.ytDlpCommand, args);

    if (!fs.existsSync(tempFilePath)) {
      throw new InternalServerErrorException(
        'El archivo no se creó. Verifica que ffmpeg esté instalado.',
      );
    }

    this.logger.log('✅ Descarga lista. Preparando stream...');

    // 3. STREAM AL CLIENTE
    const fileStream = fs.createReadStream(tempFilePath);

    // Borrar archivo temporal cuando se termine de enviar
    fileStream.on('close', () => {
      fs.unlink(tempFilePath, (err) => {
        if (err) this.logger.error(`Error borrando temporal: ${err}`);
      });
    });

    return new AudioResponseDto(
      new StreamableFile(fileStream),
      `${videoTitle}.${format}`,
    );
  }

  private getVideoTitle(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        '--get-title',
        '--no-warnings',
        '--no-playlist',
        '--user-agent',
        this.userAgent,
        url,
      ];

      const child = spawn(this.ytDlpCommand, args);

      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) resolve(output.trim());
        else reject(new Error('Error obteniendo título'));
      });
    });
  }

  private runSpawn(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.debug(`Ejecutando yt-dlp (Básico)...`);

      const child = spawn(command, args);

      // Monitoreo básico de errores
      child.stderr.on('data', (data) => {
        const msg = data.toString();
        // Solo mostrar errores reales, ignorar barras de progreso
        if (
          !msg.includes('[download]') &&
          !msg.includes('ETA') &&
          !msg.includes('frame')
        ) {
          console.error(`yt-dlp log: ${msg}`);
        }
      });

      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Exit Code: ${code}`));
      });
    });
  }
}
