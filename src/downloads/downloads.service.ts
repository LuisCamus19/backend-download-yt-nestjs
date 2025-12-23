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
  private ytDlpCommand = 'yt-dlp';

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

    let videoTitle = 'archivo_descargado';
    try {
      videoTitle = await this.getVideoTitle(videoUrl);
    } catch (e) {
      this.logger.warn(
        '⚠️ No se pudo obtener título (normal en Render), usando genérico.',
      );
    }

    videoTitle = videoTitle.replace(/[\\/:*?"<>|]/g, '_');
    this.logger.log(`Título a usar: ${videoTitle}`);

    const processId = uuidv4();
    const cookiesPathRender = '/etc/secrets/cookies.txt';
    const cookiesPathLocal = './cookies.txt';

    let cookiesToUse = '';
    let tempCookiesPath = '';

    if (fs.existsSync(cookiesPathRender)) {
      this.logger.log('🍪 Detectadas cookies en Secrets (Render)');
      tempCookiesPath = path.join(os.tmpdir(), `cookies_${processId}.txt`);
      try {
        fs.copyFileSync(cookiesPathRender, tempCookiesPath);
        cookiesToUse = tempCookiesPath;
        this.logger.log(`🍪 Cookies copiadas: ${cookiesToUse}`);
      } catch (err) {
        this.logger.error(`Error copiando cookies: ${err}`);
      }
    } else if (fs.existsSync(cookiesPathLocal)) {
      this.logger.log('🍪 Usando cookies locales');
      cookiesToUse = cookiesPathLocal;
    }

    const uniqueFileName = `temp_${processId}.${format}`;
    const tempFilePath = path.join(os.tmpdir(), uniqueFileName);

    const args: string[] = [];

    // Cookies
    if (cookiesToUse) {
      args.push('--cookies', cookiesToUse);
    }

    args.push('--user-agent', this.userAgent);

    args.push('--no-playlist');
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
      args.push(
        '-f',
        `bestvideo[height<=${res}]+bestaudio/best[height<=${res}]`,
      );
      args.push('--merge-output-format', 'mp4');
    }

    args.push(videoUrl);

    // 4. EJECUCIÓN
    await this.runSpawn(this.ytDlpCommand, args);

    if (!fs.existsSync(tempFilePath)) {
      throw new InternalServerErrorException('El archivo no se creó.');
    }

    this.logger.log('✅ Descarga lista. Preparando stream...');

    // 5. STREAM Y LIMPIEZA
    const fileStream = fs.createReadStream(tempFilePath);

    fileStream.on('close', () => {
      fs.unlink(tempFilePath, (err) => {
        if (err) this.logger.error(`Error borrando video: ${err}`);
        else this.logger.log(`🗑️ Video borrado: ${uniqueFileName}`);
      });

      if (tempCookiesPath && fs.existsSync(tempCookiesPath)) {
        fs.unlink(tempCookiesPath, (err) => {
        });
      }
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
      this.logger.debug(`Ejecutando descarga...`);

        const child = spawn(command, args);
        
      child.stderr.on('data', (data) => console.error(`yt-dlp error: ${data}`));

      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Exit Code: ${code}`));
      });

      setTimeout(
        () => {
          child.kill();
          reject(new Error('Timeout'));
        },
        15 * 60 * 1000,
      );
    });
  }
}
