import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';

export class VideoService {
    private tempDir: string;

    constructor() {
        this.tempDir = path.join(process.cwd(), 'temp');
    }

    async initialize() {
        await fs.mkdir(this.tempDir, { recursive: true });
    }

    async createVideo(
        frames: Buffer[],
        outputPath: string,
        musicPath?: string,
        duration: number = 22
    ): Promise<void> {
        // Save frames as temporary images
        const frameFiles: string[] = [];
        for (let i = 0; i < frames.length; i++) {
            const framePath = path.join(this.tempDir, `frame_${i}.png`);
            await fs.writeFile(framePath, frames[i]);
            frameFiles.push(framePath);
        }

                // Calculate the frame display duration to achieve smooth transitions
        // while maintaining the desired total duration
        const frameTime = duration / frames.length;

        console.log(`Frame time: ${frameTime} Frames: ${frames.length}`);

        return new Promise((resolve, reject) => {
            let command = ffmpeg()
                .input(path.join(this.tempDir, 'frame_%d.png'))
                .inputFPS(1/frameTime) // Set input fps based on desired frame display time
                .outputOptions('-c:v libx264')
                .outputOptions('-pix_fmt yuv420p')
                .outputOptions('-r 30') // Set output framerate to fixed 30fps
                .size('1080x1920'); // TikTok vertical format

            if (musicPath) {
                command = command
                    .input(musicPath)
                    .audioCodec('aac')
                    .audioBitrate('192k');
            }

            command
                .output(outputPath)
                .on('end', async () => {
                    // Cleanup temporary files
                    await Promise.all(frameFiles.map(file => fs.unlink(file)));
                    resolve();
                })
                .on('error', (err) => {
                    reject(err);
                })
                .run();
        });
    }

    async cleanup() {
        await fs.rm(this.tempDir, { recursive: true, force: true });
    }
}