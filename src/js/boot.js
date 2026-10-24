/* 设计 75：入口。先检查手机里的资源（缺的、改过的下好），再读游戏本体（main.js 和 three.js 都在它里面，用到时才执行） */
import { assetCheck } from './assetboot.js';
assetCheck().catch(e => console.warn('[设计75] 资源检查出错，照旧从网上读', e)).then(() => import('./main.js'));
