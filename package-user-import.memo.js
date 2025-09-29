// package.json
{
  "name": "@your-scope/rapier-worker",
  "version": "0.1.0",
  "main": "dist-worker/rapier-worker.cjs.js",  // CJS 必要なら
  "module": "dist-worker/rapier-worker.es.js",
  "exports": {
    ".": {
      "import": "./dist-worker/rapier-worker.es.js"
    },
    "./RapierWorker": {
      "import": "./dist-worker/rapier-worker.es.js"
    }
  },
  "peerDependencies": {
    "react": ">=18",
    "react-dom": ">=18",
    "aframe": ">=1.4.0"
  },
  "devDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "aframe": "^1.4.0"
  }
}

// user side import
// ライブラリ名経由で import
import { RapierWorker, getRigidBody, storedBodies } from '@your-scope/rapier-worker';
