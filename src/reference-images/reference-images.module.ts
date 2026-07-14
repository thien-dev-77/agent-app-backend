import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferenceImage } from '../entities/reference-image.entity';
import { ReferenceImagesController } from './reference-images.controller';
import { ReferenceImagesService } from './reference-images.service';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [TypeOrmModule.forFeature([ReferenceImage]), UploadModule],
  controllers: [ReferenceImagesController],
  providers: [ReferenceImagesService],
  exports: [ReferenceImagesService],
})
export class ReferenceImagesModule {}
