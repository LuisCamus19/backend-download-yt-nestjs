import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { spawn } from 'child_process'; // Equivalente a ProcessBuilder
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid'; // Necesitarás instalar uuid: npm i uuid && npm i -D @types/uuid
import { DownloadRequestDto } from './dto/download-request.dto';
import { AudioResponseDto } from './dto/audio-response.dto';
import { StreamableFile } from '@nestjs/common';

@Injectable()
export class DownloadsService {
  private readonly logger = new Logger(DownloadsService.name);

  // En Node/Render, es mejor usar las versiones del sistema o instalarlas via NPM.
  // Asumiremos que 'yt-dlp' y 'ffmpeg' están en el PATH del sistema (Render lo facilita).
  private ytDlpCommand = 'yt-dlp';

  // Si necesitas rutas especificas como en tu Java, podrías usar process.env.YT_DLP_PATH

  async downloadAudio(request: DownloadRequestDto): Promise<AudioResponseDto> {
    return this.ejecutarDescarga(request.url, request.quality, 'mp3');
  }

  async downloadVideo(request: DownloadRequestDto): Promise<AudioResponseDto> {
    // Si quality viene null, usamos 1080 por defecto, igual que tu Java
    const resolution = request.quality || '1080';
    return this.ejecutarDescarga(request.url, resolution, 'mp4');
  }

  private async ejecutarDescarga(
    videoUrl: string,
    qualityParam: string,
    format: string,
  ): Promise<AudioResponseDto> {
    this.logger.log(`--- NUEVA SOLICITUD --- URL: ${videoUrl}`);

    // 1. OBTENER TÍTULO
    let videoTitle = 'archivo_descargado';
    try {
      videoTitle = await this.getVideoTitle(videoUrl);
    } catch (e) {
      this.logger.warn('⚠️ No se pudo obtener título, usando genérico.');
    }

    // Limpieza del nombre (Tu regex de Java traducido a JS)
    videoTitle = videoTitle.replace(/[\\/:*?"<>|]/g, '_');
    this.logger.log(`Título: ${videoTitle}`);

    // 2. RUTAS
    const uniqueFileName = `temp_${uuidv4()}.${format}`;
    const tempFilePath = path.join(os.tmpdir(), uniqueFileName);

    // 3. CONSTRUIR ARGUMENTOS (Igual que tu lista 'commands' en Java)
    const args: string[] = [];

    // Rutas de ffmpeg (si no está en el PATH global, define la ruta aquí)
    // args.push('--ffmpeg-location', '/usr/bin/ffmpeg');

    args.push('--no-playlist'); // Evitar descargar listas enteras
    args.push('-o', tempFilePath);
    args.push('--force-overwrites');

    if (format === 'mp3') {
      const bitrate = qualityParam ? `${qualityParam}K` : '192K';
      args.push('-x');
      args.push('--audio-format', 'mp3');
      args.push('--audio-quality', bitrate);
      args.push('--add-metadata');
    } else {
      const res = qualityParam || '1080';
      // Tu lógica exacta de formato de video
      args.push(
        '-f',
        `bestvideo[height<=${res}]+bestaudio/best[height<=${res}]`,
      );
      args.push('--merge-output-format', 'mp4');
    }

    args.push(videoUrl);

    // 4. EJECUCIÓN DEL PROCESO
    await this.runSpawn(this.ytDlpCommand, args);

    // 5. VERIFICACIÓN Y RESPUESTA (STREAMING)
    if (!fs.existsSync(tempFilePath)) {
      throw new InternalServerErrorException('El archivo no se creó.');
    }

    this.logger.log('✅ Descarga lista. Preparando stream...');

    // 🔥 AQUÍ ESTÁ LA MAGIA DEL STREAM 🔥
    // En lugar de leer todo el archivo a RAM, creamos un flujo de lectura.
    const fileStream = fs.createReadStream(tempFilePath);

    // TRUCO PRO: Borrar el archivo temporal cuando el stream termine de leerse
    // Así no llenamos el disco duro de basura temporal.
    fileStream.on('close', () => {
      fs.unlink(tempFilePath, (err) => {
        if (err) this.logger.error(`Error borrando temp: ${err}`);
        else this.logger.log(`🗑️ Archivo temporal borrado: ${uniqueFileName}`);
      });
    });

    // Envolvemos el stream en StreamableFile (clase de NestJS)
    return new AudioResponseDto(
      new StreamableFile(fileStream),
      `${videoTitle}.${format}`,
    );
  }

  // Método auxiliar para obtener el título (Promisificado)
  private getVideoTitle(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = ['--get-title', '--no-warnings', '--no-playlist', url];
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

  // Método auxiliar para ejecutar comandos (Promisificado)
  private runSpawn(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.debug(`Ejecutando: ${command} ${args.join(' ')}`);

      const child = spawn(command, args);

      // Opcional: ver logs de yt-dlp en la consola de Nest
      // child.stdout.on('data', (data) => console.log(`yt-dlp: ${data}`));
      // child.stderr.on('data', (data) => console.error(`yt-dlp error: ${data}`));

      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Proceso falló con código ${code}`));
      });

      // Timeout de 15 minutos (Igual que en tu Java)
      setTimeout(
        () => {
          child.kill();
          reject(new Error('Tiempo de espera agotado (Timeout)'));
        },
        15 * 60 * 1000,
      );
    });
  }
}
