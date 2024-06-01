import * as fs from 'fs-extra';
import * as https from 'https';

// import { promisify } from 'util';
// import stream from 'stream';
// const got$ = import('got');
// import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent';

// const httpProxyAgent = !process.env.HTTP_PROXY ? undefined : new HttpProxyAgent({
//     proxy: process.env.HTTP_PROXY
// });
//
// const httpsProxyAgent = !process.env.HTTPS_PROXY ? undefined : new HttpsProxyAgent({
//     proxy: process.env.HTTPS_PROXY
// });
//
// const options = {
//     headers: {
//         'user-agent': 'nodejs'
//     },
// }

export class Download {

    static async getText(uri: string): Promise<string> {
        const body = await new Promise((resolve, reject) => {
            https.get(uri, (response) => {
                let data = '';

                response.on('data', (chunk) => {
                    data += chunk;
                });

                response.on('end', () => {
                    resolve(data);
                });
            }).on('error', (error) => {
                reject(error);
            });
        });;
        return JSON.parse(body as string)
    }

    static getFile(uri: string, destination: string, progress = false): Promise<void> {
        const writeStream = fs.createWriteStream(destination);
        return new Promise((resolve, reject) => {

            https.get(uri, (response) => {
                response.pipe(writeStream);

                writeStream.on('finish', () => {
                    writeStream.close(()=>{
                        resolve();
                    });
                });
            }).on('error', (error) => {
                fs.unlink(destination, () => {
                    reject(error);
                });
            });
        });
        // if (progress) {
        //     writeStream.on('downloadProgress', ({ transferred, total, percent }: any) => {
        //         const currentTime = Date.now();
        //         if (total > 0 && (lastTick === 0 || transferred === total || currentTime - lastTick >= 2000)) {
        //             console.log(`progress: ${transferred}/${total} (${Math.floor(100 * percent)}%)`);
        //             lastTick = currentTime;
        //         }
        //     });
        // }
    }
}
