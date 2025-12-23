import {
  Controller,
  Post,
  Body,
  Res,
  BadRequestException,
  InternalServerErrorException,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { DownloadsService } from './downloads.service';
import { DownloadRequestDto } from './dto/download-request.dto';

@Controller('downloads')
export class DownloadsController {
  constructor(private readonly downloadsService: DownloadsService) {}

  @Post('mp3')
  async downloadMp3(@Body() request: DownloadRequestDto, @Res() res: Response) {
    try {
      const response = await this.downloadsService.downloadAudio(request);

      const originalFilename = response.filename;
      const encodedFilename = encodeURIComponent(originalFilename).replace(
        /%20/g,
        ' ',
      );

      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="download.mp3"`,
        'X-Filename': encodedFilename,
        'Access-Control-Expose-Headers': 'Content-Disposition, X-Filename',
      });

      const file = response.file;

      if (file instanceof StreamableFile) {
        file.getStream().pipe(res);
      } else {
        res.send(file);
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('video')
  async downloadVideo(
    @Body() request: DownloadRequestDto,
    @Res() res: Response,
  ) {
    try {
      const response = await this.downloadsService.downloadVideo(request);

      const originalFilename = response.filename;
      const encodedFilename = encodeURIComponent(originalFilename).replace(
        /%20/g,
        ' ',
      );

      res.set({
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="video.mp4"`,
        'X-Filename': encodedFilename,
        'Access-Control-Expose-Headers': 'Content-Disposition, X-Filename',
      });

      const file = response.file;

      if (file instanceof StreamableFile) {
        file.getStream().pipe(res);
      } else {
        res.send(file);
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: any) {
    if (error.message && error.message.includes('validación')) {
      throw new BadRequestException(error.message);
    }
    console.error(error);
    throw new InternalServerErrorException(
      'Error en el servidor: ' + error.message,
    );
  }
}
