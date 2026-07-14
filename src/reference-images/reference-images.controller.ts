import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ReferenceImagesService } from './reference-images.service';

@Controller('reference-images')
export class ReferenceImagesController {
  constructor(private readonly service: ReferenceImagesService) {}

  // GET /reference-images — lấy toàn bộ thư viện
  @Get()
  findAll() {
    return this.service.findAll();
  }

  // POST /reference-images/upload — upload + lưu vào DB
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new BadRequestException(`Invalid type: ${file.mimetype}`), false);
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('label') label?: string,
    @Body('tags') tags?: string,
  ) {
    if (!file) throw new BadRequestException('No file');
    const parsedTags = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    return this.service.uploadAndSave(file, label, parsedTags);
  }

  // DELETE /reference-images/:id
  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
    return { success: true };
  }
}
